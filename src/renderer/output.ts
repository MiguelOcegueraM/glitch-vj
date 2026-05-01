// Output window: captures the main window's content and displays it fullscreen
// Uses Electron's chromeMediaSource to capture the specific window by ID

declare global {
  interface Window {
    outputAPI?: {
      onSourceId: (callback: (sourceId: string) => void) => void;
    };
  }
}

async function startCapture(sourceId: string) {
  const video = document.getElementById("output-video") as HTMLVideoElement;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
          minWidth: 1280,
          minHeight: 720,
          maxFrameRate: 60,
        },
      } as any, // Electron-specific constraints
    });

    video.srcObject = stream;
    await video.play();
  } catch (err) {
    console.error("Failed to capture main window:", err);
  }
}

if (window.outputAPI) {
  window.outputAPI.onSourceId((sourceId) => {
    startCapture(sourceId);
  });
}
