document.addEventListener('DOMContentLoaded', () => {
    // States
    let sourceImageFile = null;
    let webcamStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordedBlob = null;
    let recordingTimer = null;
    let recordingSeconds = 0;
    const RECORDING_LIMIT_SECONDS = 5; // Limit recording to 5 seconds to keep speed fast

    // URLs returned from backend
    let finalVideoUrl = "";
    let finalVideoConcatUrl = "";

    // DOM Elements - Step 1
    const imageInput = document.getElementById('image-input');
    const imageDropzone = document.getElementById('image-dropzone');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const removeImageBtn = document.getElementById('remove-image-btn');
    const uploadPlaceholder = document.querySelector('.upload-placeholder');

    // DOM Elements - Step 2
    const enableCameraBtn = document.getElementById('enable-camera-btn');
    const webcamViewport = document.getElementById('webcam-viewport');
    const webcamVideo = document.getElementById('webcam-video');
    const webcamInactivePlaceholder = document.getElementById('webcam-inactive-placeholder');
    const webcamControlsContainer = document.getElementById('webcam-controls-container');
    const recordBtn = document.getElementById('record-btn');
    const recordDot = document.getElementById('record-dot');
    const timerDisplay = document.getElementById('timer-display');
    
    const recordedPreviewViewport = document.getElementById('recorded-preview-viewport');
    const recordedVideo = document.getElementById('recorded-video');
    const rerecordBtn = document.getElementById('rerecord-btn');

    // DOM Elements - Step 3
    const idleView = document.getElementById('idle-view');
    const generateBtn = document.getElementById('generate-btn');
    const processingView = document.getElementById('processing-view');
    const progressIndicator = document.getElementById('progress-indicator');
    const statusTitle = document.getElementById('status-title');
    const statusDesc = document.getElementById('status-desc');
    const step1Lbl = document.getElementById('step-1-lbl');
    const step2Lbl = document.getElementById('step-2-lbl');
    const step3Lbl = document.getElementById('step-3-lbl');
    
    const resultView = document.getElementById('result-view');
    const tabResult = document.getElementById('tab-result');
    const tabCompare = document.getElementById('tab-compare');
    const finalVideo = document.getElementById('final-video');
    const downloadBtn = document.getElementById('download-btn');
    const resetAllBtn = document.getElementById('reset-all-btn');

    // ----------------------------------------------------
    // Step 1: Image Upload Logic
    // ----------------------------------------------------
    
    // Trigger file selection on dropzone click (if not previewing)
    imageDropzone.addEventListener('click', (e) => {
        if (e.target !== removeImageBtn && !imagePreviewContainer.contains(e.target)) {
            imageInput.click();
        }
    });

    // Drag and drop handlers
    imageDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        imageDropzone.classList.add('dragover');
    });

    imageDropzone.addEventListener('dragleave', () => {
        imageDropzone.classList.remove('dragover');
    });

    imageDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        imageDropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleImageFile(e.dataTransfer.files[0]);
        }
    });

    imageInput.addEventListener('change', () => {
        if (imageInput.files.length > 0) {
            handleImageFile(imageInput.files[0]);
        }
    });

    function handleImageFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('画像ファイルを選択してください。');
            return;
        }
        sourceImageFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            uploadPlaceholder.classList.add('hidden');
            imagePreviewContainer.classList.remove('hidden');
            checkReadyState();
        };
        reader.readAsDataURL(file);
    }

    removeImageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sourceImageFile = null;
        imageInput.value = '';
        imagePreview.src = '';
        imagePreviewContainer.classList.add('hidden');
        uploadPlaceholder.classList.remove('hidden');
        checkReadyState();
    });

    // ----------------------------------------------------
    // Step 2: Webcam Recording Logic
    // ----------------------------------------------------

    enableCameraBtn.addEventListener('click', async () => {
        try {
            webcamStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: "user" },
                audio: false // No audio needed for driving motion
            });
            webcamVideo.srcObject = webcamStream;
            webcamInactivePlaceholder.classList.add('hidden');
            webcamControlsContainer.classList.remove('hidden');
        } catch (err) {
            console.error('Camera access error:', err);
            alert('ウェブカメラへのアクセスが拒否されました。カメラのアクセス許可を確認してください。');
        }
    });

    recordBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            stopRecording();
        } else {
            startRecording();
        }
    });

    function startRecording() {
        recordedChunks = [];
        let options = { mimeType: 'video/webm;codecs=vp9' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/webm;codecs=vp8' };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/webm' };
        }
        
        mediaRecorder = new MediaRecorder(webcamStream, options);
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = () => {
            recordedBlob = new Blob(recordedChunks, { type: 'video/webm' });
            const videoURL = URL.createObjectURL(recordedBlob);
            recordedVideo.src = videoURL;
            
            // Switch views
            webcamViewport.classList.add('hidden');
            recordedPreviewViewport.classList.remove('hidden');
            webcamControlsContainer.classList.add('hidden');
            
            checkReadyState();
        };

        mediaRecorder.start();
        
        // UI updates
        recordBtn.innerHTML = '<span class="btn-icon"></span> 録画停止';
        recordBtn.classList.add('recording');
        recordDot.classList.remove('hidden');
        timerDisplay.classList.remove('hidden');
        
        // Start timer
        recordingSeconds = 0;
        timerDisplay.textContent = `00:0${recordingSeconds}`;
        
        recordingTimer = setInterval(() => {
            recordingSeconds++;
            timerDisplay.textContent = `00:0${recordingSeconds}`;
            if (recordingSeconds >= RECORDING_LIMIT_SECONDS) {
                stopRecording();
            }
        }, 1000);
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
        }
        clearInterval(recordingTimer);
        recordBtn.innerHTML = '<span class="btn-icon"></span> 録画開始';
        recordBtn.classList.remove('recording');
        recordDot.classList.add('hidden');
        timerDisplay.classList.add('hidden');
    }

    rerecordBtn.addEventListener('click', () => {
        recordedBlob = null;
        recordedVideo.src = '';
        
        // Switch back to live view
        recordedPreviewViewport.classList.add('hidden');
        webcamViewport.classList.remove('hidden');
        webcamControlsContainer.classList.remove('hidden');
        
        checkReadyState();
    });

    // ----------------------------------------------------
    // Step 3: Animate / Morph Logic
    // ----------------------------------------------------

    function checkReadyState() {
        if (sourceImageFile && recordedBlob) {
            generateBtn.disabled = false;
            generateBtn.className = 'btn btn-primary';
        } else {
            generateBtn.disabled = true;
            generateBtn.className = 'btn btn-disabled';
        }
    }

    generateBtn.addEventListener('click', async () => {
        if (!sourceImageFile || !recordedBlob) return;

        // Switch to processing view
        idleView.classList.add('hidden');
        processingView.classList.remove('hidden');
        generateBtn.disabled = true;

        const formData = new FormData();
        formData.append('source_image', sourceImageFile);
        formData.append('driving_video', recordedBlob, 'webcam.webm');

        // Progress simulation for premium UX
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 1;
            if (progress <= 30) {
                progressIndicator.style.width = `${progress}%`;
                statusTitle.textContent = "画像と録画データの読み込み中...";
                statusDesc.textContent = "アップロードされた顔写真と録画ファイルを準備しています。";
                step1Lbl.className = "step-item active";
            } else if (progress <= 70) {
                progressIndicator.style.width = `${progress}%`;
                statusTitle.textContent = "表情モーションの抽出中...";
                statusDesc.textContent = "顔のランドマークを検出し、録画ビデオから表情の動きをトレースしています。";
                step2Lbl.className = "step-item active";
            } else if (progress <= 95) {
                progressIndicator.style.width = `${progress}%`;
                statusTitle.textContent = "ポートレート縫合・動画生成中...";
                statusDesc.textContent = "静止画の輪郭に合わせて表情データを縫合（stitching）し、滑らかな動画として出力しています。";
                step3Lbl.className = "step-item active";
            }
        }, 300); // 300ms * 100 steps = ~30 seconds total simulation

        try {
            const response = await fetch('/animate', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Morphing failed.');
            }

            const data = await response.json();
            
            clearInterval(progressInterval);
            progressIndicator.style.width = '100%';
            
            // Set final URLs
            finalVideoUrl = data.video_url;
            finalVideoConcatUrl = data.video_concat_url;

            // Load final video
            finalVideo.src = finalVideoUrl;
            downloadBtn.href = finalVideoUrl;

            // Switch to result view
            setTimeout(() => {
                processingView.classList.add('hidden');
                resultView.classList.remove('hidden');
            }, 800);

        } catch (err) {
            console.error('API Error:', err);
            clearInterval(progressInterval);
            alert(`エラーが発生しました: ${err.message}`);
            // Return to idle view
            processingView.classList.add('hidden');
            idleView.classList.remove('hidden');
            checkReadyState();
        }
    });

    // Result tabs toggling
    tabResult.addEventListener('click', () => {
        tabResult.classList.add('active');
        tabCompare.classList.remove('active');
        finalVideo.src = finalVideoUrl;
        downloadBtn.href = finalVideoUrl;
    });

    tabCompare.addEventListener('click', () => {
        tabCompare.classList.add('active');
        tabResult.classList.remove('active');
        finalVideo.src = finalVideoConcatUrl;
        downloadBtn.href = finalVideoConcatUrl;
    });

    // Reset all states
    resetAllBtn.addEventListener('click', () => {
        // Reset source image
        sourceImageFile = null;
        imageInput.value = '';
        imagePreview.src = '';
        imagePreviewContainer.classList.add('hidden');
        uploadPlaceholder.classList.remove('hidden');

        // Reset webcam preview
        recordedBlob = null;
        recordedVideo.src = '';
        recordedPreviewViewport.classList.add('hidden');
        webcamViewport.classList.remove('hidden');
        
        // Clear camera streams
        if (webcamStream) {
            webcamStream.getTracks().forEach(track => track.stop());
            webcamVideo.srcObject = null;
            webcamStream = null;
        }
        webcamInactivePlaceholder.classList.remove('hidden');
        webcamControlsContainer.classList.add('hidden');

        // Reset output view
        finalVideo.src = '';
        finalVideoUrl = '';
        finalVideoConcatUrl = '';
        tabResult.classList.add('active');
        tabCompare.classList.remove('active');

        // Switch to idle view
        resultView.classList.add('hidden');
        idleView.classList.remove('hidden');
        
        // Reset progress indicator labels
        progressIndicator.style.width = '0%';
        step1Lbl.className = "step-item";
        step2Lbl.className = "step-item";
        step3Lbl.className = "step-item";

        checkReadyState();
    });
});
