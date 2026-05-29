# coding: utf-8

import sys
import os
import shutil
import uuid
import time
import argparse

# Add parent directory to sys.path to allow importing src.*
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from src.live_portrait_pipeline import LivePortraitPipeline
from src.config.crop_config import CropConfig
from src.config.argument_config import ArgumentConfig
from src.config.inference_config import InferenceConfig

def partial_fields(target_class, kwargs):
    return target_class(**{k: v for k, v in kwargs.items() if hasattr(target_class, k)})

# Directories setup
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
OUTPUTS_DIR = os.path.join(STATIC_DIR, "outputs")
TEMP_DIR = os.path.join(BASE_DIR, "temp")

os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(OUTPUTS_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

# Initialize FastAPI
app = FastAPI(title="LivePortrait Custom Webcam App")

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables for pipeline
pipeline = None
args_default = None

def init_pipeline():
    global pipeline, args_default
    print("Initializing LivePortrait Pipeline...")
    args_default = ArgumentConfig()
    
    # Configure default parameters for the custom app
    args_default.flag_stitching = True
    args_default.flag_relative_motion = True
    args_default.flag_do_crop = True
    args_default.flag_pasteback = True
    args_default.driving_option = "expression-friendly"
    args_default.flag_crop_driving_video = True
    args_default.output_dir = OUTPUTS_DIR
    
    inference_cfg = partial_fields(InferenceConfig, args_default.__dict__)
    crop_cfg = partial_fields(CropConfig, args_default.__dict__)
    
    pipeline = LivePortraitPipeline(inference_cfg=inference_cfg, crop_cfg=crop_cfg)
    print("Pipeline initialized successfully!")

@app.on_event("startup")
async def startup_event():
    init_pipeline()

@app.get("/")
async def root():
    return RedirectResponse(url="/static/index.html")

@app.post("/animate")
async def animate(
    source_image: UploadFile = File(...),
    driving_video: UploadFile = File(...)
):
    if not pipeline:
        raise HTTPException(status_code=500, detail="Pipeline not initialized.")
        
    request_id = str(uuid.uuid4())
    
    # Save uploaded files
    source_ext = os.path.splitext(source_image.filename)[1]
    driving_ext = os.path.splitext(driving_video.filename)[1]
    
    # Normalize extensions or set defaults
    if not source_ext:
        source_ext = ".png"
    if not driving_ext:
        driving_ext = ".mp4"
        
    temp_source_path = os.path.join(TEMP_DIR, f"{request_id}_source{source_ext}")
    temp_driving_path = os.path.join(TEMP_DIR, f"{request_id}_driving{driving_ext}")
    temp_driving_transcoded_path = os.path.join(TEMP_DIR, f"{request_id}_driving_transcoded.mp4")
    
    try:
        with open(temp_source_path, "wb") as f:
            shutil.copyfileobj(source_image.file, f)
        with open(temp_driving_path, "wb") as f:
            shutil.copyfileobj(driving_video.file, f)
            
        # Transcode driving video to a standard MP4 at 30 FPS using ffmpeg to fix potential browser recording metadata issues (e.g. variable FPS, 1000 FPS reported)
        ffmpeg_bin = os.path.abspath(os.path.join(BASE_DIR, "..", "ffmpeg", "ffmpeg.exe"))
        if not os.path.exists(ffmpeg_bin):
            ffmpeg_bin = "ffmpeg"
            
        print(f"[{request_id}] Transcoding driving video with FFmpeg...")
        import subprocess
        cmd = [
            ffmpeg_bin, "-y",
            "-i", temp_driving_path,
            "-r", "30",
            "-pix_fmt", "yuv420p",
            "-vcodec", "libx264",
            temp_driving_transcoded_path
        ]
        
        run_driving_path = temp_driving_path
        try:
            process = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30)
            if process.returncode != 0:
                print(f"[{request_id}] FFmpeg warning/error (code {process.returncode}): {process.stderr}")
            else:
                print(f"[{request_id}] FFmpeg transcoding successful.")
                run_driving_path = temp_driving_transcoded_path
        except Exception as ffmpeg_err:
            print(f"[{request_id}] FFmpeg failed to execute: {ffmpeg_err}")
            
        print(f"[{request_id}] Running LivePortrait animation...")
        
        # Configure ArgumentConfig for this specific run
        run_args = ArgumentConfig()
        run_args.__dict__.update(args_default.__dict__)
        
        run_args.source = temp_source_path
        run_args.driving = run_driving_path
        run_args.output_dir = OUTPUTS_DIR
        
        # Set a unique prefix based on timestamp to avoid name collisions
        timestamp_prefix = time.strftime("%Y%m%d-%H%M%S")
        
        # Update pipeline configurations to use these temporary paths
        pipeline.live_portrait_wrapper.update_config(run_args.__dict__)
        pipeline.cropper.update_config(run_args.__dict__)
        
        # Try to execute the pipeline with dynamic threshold fallback
        try:
            # Set default high-confidence detection threshold
            run_args.det_thresh = 0.15
            pipeline.cropper.face_analysis_wrapper.det_model.det_thresh = 0.15
            wfp, wfp_concat = pipeline.execute(run_args)
        except Exception as first_err:
            if "No face detected" in str(first_err):
                print(f"[{request_id}] No face detected with det_thresh=0.15. Retrying with det_thresh=0.05...")
                try:
                    run_args.det_thresh = 0.05
                    pipeline.cropper.face_analysis_wrapper.det_model.det_thresh = 0.05
                    wfp, wfp_concat = pipeline.execute(run_args)
                except Exception as second_err:
                    if "No face detected" in str(second_err):
                        print(f"[{request_id}] No face detected with det_thresh=0.05. Retrying with det_thresh=0.01...")
                        run_args.det_thresh = 0.01
                        pipeline.cropper.face_analysis_wrapper.det_model.det_thresh = 0.01
                        wfp, wfp_concat = pipeline.execute(run_args)
                    else:
                        raise second_err
            else:
                raise first_err
        
        # Get relative paths for frontend playback
        wfp_filename = os.path.basename(wfp)
        wfp_concat_filename = os.path.basename(wfp_concat)
        
        return {
            "success": True,
            "video_url": f"/static/outputs/{wfp_filename}",
            "video_concat_url": f"/static/outputs/{wfp_concat_filename}"
        }
        
    except Exception as e:
        print(f"Error during animation: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
        
    finally:
        # Clean up temporary uploaded files
        if os.path.exists(temp_source_path):
            try: os.remove(temp_source_path)
            except: pass
        if os.path.exists(temp_driving_path):
            try: os.remove(temp_driving_path)
            except: pass
        if os.path.exists(temp_driving_transcoded_path):
            try: os.remove(temp_driving_transcoded_path)
            except: pass

# Serve the static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    
    # Enforce UTF-8 Mode for python printing/logging on Windows
    os.environ["PYTHONUTF8"] = "1"
    os.environ["PYTHONIOENCODING"] = "utf-8"
    
    uvicorn.run("server:app", host="127.0.0.1", port=args.port, reload=False)
