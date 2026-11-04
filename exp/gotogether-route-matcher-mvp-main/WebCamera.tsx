import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export type WebCameraHandle = {
  takePhoto: () => Promise<string>;
};

type Props = {
  facing: 'front' | 'back';
  onReady?: () => void;
  onError?: (message: string) => void;
};

const WebCamera = forwardRef<WebCameraHandle, Props>(
  ({ facing, onReady, onError }, ref) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
      let cancelled = false;

      const startCamera = async () => {
        try {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
              'Browser camera access is not supported.'
            );
          }

          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => {
              track.stop();
            });
            streamRef.current = null;
          }

          const stream =
            await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode:
                  facing === 'back'
                    ? { ideal: 'environment' }
                    : { ideal: 'user' },
              },
              audio: false,
            });

          if (cancelled) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          streamRef.current = stream;

          const video = videoRef.current;

          if (!video) {
            throw new Error('Camera video element is not ready.');
          }

          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          video.autoplay = true;

          await video.play();

          const waitForVideo = () =>
            new Promise<void>((resolve, reject) => {
              const check = () => {
                if (
                  video.readyState >= 2 &&
                  video.videoWidth > 0 &&
                  video.videoHeight > 0
                ) {
                  resolve();
                  return;
                }

                setTimeout(check, 100);
              };

              setTimeout(() => {
                if (
                  video.readyState >= 2 &&
                  video.videoWidth > 0
                ) {
                  resolve();
                } else {
                  reject(
                    new Error(
                      'Browser camera video did not become ready.'
                    )
                  );
                }
              }, 10000);

              check();
            });

          await waitForVideo();

          if (!cancelled) {
            console.log(
              'WEB CAMERA READY:',
              facing,
              video.videoWidth,
              video.videoHeight
            );

            onReady?.();
          }
        } catch (error) {
          console.log('WEB CAMERA ERROR:', error);

          onError?.(
            error instanceof Error
              ? error.message
              : 'Unable to start browser camera.'
          );
        }
      };

      startCamera();

      return () => {
        cancelled = true;

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => {
            track.stop();
          });

          streamRef.current = null;
        }
      };
    }, [facing, onReady, onError]);

    useImperativeHandle(ref, () => ({
      takePhoto: async () => {
        const video = videoRef.current;

        if (!video) {
          throw new Error('Camera video is not available.');
        }

        if (
          video.readyState < 2 ||
          video.videoWidth === 0 ||
          video.videoHeight === 0
        ) {
          throw new Error(
            'Camera frame is not ready yet.'
          );
        }

        const canvas = document.createElement('canvas');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error(
            'Could not create camera capture canvas.'
          );
        }

        context.drawImage(
          video,
          0,
          0,
          canvas.width,
          canvas.height
        );

        const dataUrl = canvas.toDataURL(
          'image/jpeg',
          0.7
        );

        const base64 = dataUrl.split(',')[1];

        if (!base64) {
          throw new Error(
            'Browser camera produced no image data.'
          );
        }

        console.log(
          'WEB PHOTO CAPTURED:',
          canvas.width,
          canvas.height
        );

        return base64;
      },
    }));

    return (
      <video
        ref={videoRef}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
        playsInline
        muted
        autoPlay
      />
    );
  }
);

WebCamera.displayName = 'WebCamera';

export default WebCamera;