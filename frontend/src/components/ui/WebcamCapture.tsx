import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, Check, Upload, AlertCircle, SwitchCamera } from 'lucide-react';

export interface WebcamCaptureProps {
  onCapture: (dataUrl: string, blob?: Blob) => void;
  onCancel?: () => void;
  className?: string;
}

export const WebcamCapture: React.FC<WebcamCaptureProps> = ({
  onCapture,
  onCancel,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | undefined>(undefined);
  const [isShutterActive, setIsShutterActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);

  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam API is not supported on this device/browser.');
      }

      // Check available video devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      setHasMultipleCameras(videoDevices.length > 1);

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn('Webcam access failed:', err);
      setCameraError(
        err.message || 'Camera permission denied or device unavailable.',
      );
    }
  }, [facingMode]);

  useEffect(() => {
    if (!capturedImage) {
      startCamera();
    }
    return () => {
      stopStream();
    };
  }, [facingMode, capturedImage, startCamera, stopStream]);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flash shutter animation
    setIsShutterActive(true);
    setTimeout(() => setIsShutterActive(false), 200);

    // If front-facing camera, mirror the image horizontally for natural look
    if (facingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(dataUrl);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedBlob(blob);
        }
      },
      'image/jpeg',
      0.9,
    );

    stopStream();
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setCapturedBlob(undefined);
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage, capturedBlob);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setCapturedImage(dataUrl);
      setCapturedBlob(file);
      stopStream();
    };
    reader.readAsDataURL(file);
  };

  const toggleFacingMode = () => {
    stopStream();
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Hidden file input for fallback upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Hidden canvas for snapshot rendering */}
      <canvas ref={canvasRef} className="hidden" />

      <div className="relative aspect-video w-full rounded-2xl bg-gray-950 overflow-hidden shadow-inner flex items-center justify-center border border-gray-800">
        {/* Shutter flash overlay */}
        {isShutterActive && (
          <div className="absolute inset-0 bg-white z-30 animate-overlay-in pointer-events-none" />
        )}

        {capturedImage ? (
          /* Captured Preview */
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            <img
              src={capturedImage}
              alt="Captured visitor snapshot"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold text-white">
              Preview
            </div>
          </div>
        ) : cameraError ? (
          /* Camera Error / Fallback State */
          <div className="p-6 text-center space-y-3 max-w-sm">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Camera Unavailable</p>
              <p className="text-xs text-gray-400">{cameraError}</p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary !bg-white !text-gray-900 hover:!bg-gray-100 text-xs !py-2 !px-4"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Photo from Device</span>
            </button>
          </div>
        ) : (
          /* Live Video Stream Viewfinder */
          <div className="relative w-full h-full">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${
                facingMode === 'user' ? 'scale-x-[-1]' : ''
              }`}
            />
            {/* Guide framing */}
            <div className="absolute inset-4 border-2 border-dashed border-white/40 rounded-xl pointer-events-none flex items-center justify-center">
              <div className="w-32 h-44 rounded-full border border-white/30 pointer-events-none" />
            </div>

            {hasMultipleCameras && (
              <button
                type="button"
                onClick={toggleFacingMode}
                className="absolute top-3 right-3 p-2.5 rounded-full bg-black/50 hover:bg-black/75 text-white backdrop-blur-md transition-colors cursor-pointer"
                title="Switch Camera"
              >
                <SwitchCamera className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-between gap-3 pt-2">
        {capturedImage ? (
          <>
            <button
              type="button"
              onClick={handleRetake}
              className="btn-secondary flex-1"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retake Photo</span>
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="btn-primary flex-1 !bg-emerald-600 hover:!bg-emerald-700 shadow-emerald-600/30"
            >
              <Check className="w-4 h-4" />
              <span>Confirm & Use</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary text-xs !py-2.5"
              title="Upload file directly"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Upload Image</span>
            </button>

            {!cameraError && (
              <button
                type="button"
                onClick={handleCapture}
                className="btn-primary flex-1 !py-2.5 text-sm font-semibold"
              >
                <Camera className="w-5 h-5" />
                <span>Capture Snapshot</span>
              </button>
            )}

            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="btn-secondary text-xs !py-2.5"
              >
                Cancel
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WebcamCapture;
