# Continual Image Trainer 2

Browser-side incremental image generator/trainer for Xero Web Lab.

## Dataset sources
- Wikimedia Commons search
- Direct image URL
- Single local image
- Entire local image folders / subfolders
- Multi-image selection fallback
- Local video frame extraction with configurable sampling FPS, start/end range, maximum frames, JPEG quality, and near-duplicate rejection

Folder images and video frames enter the same sequential training queue as web-search images, so training remains one sample at a time. **Train entire queue** walks the queue sequentially with the normal replay-memory system.

## Persistence
- TensorFlow.js model weights in IndexedDB
- training metadata in localStorage
- replay samples in IndexedDB so continual-learning replay survives browser reloads/checkpoint loads
- TensorFlow.js JSON/BIN export and import

Local images and videos are decoded in the browser and are not uploaded by the app.
