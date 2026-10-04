# Local speech fixtures

`jfk.mp3` is the short John F. Kennedy inaugural speech sample supplied by the official whisper.cpp repository, tag v1.9.4 (`samples/jfk.mp3`). Its recognizable public speech lets integration tests detect an empty or unrelated transcription. Upstream repository: https://github.com/ggml-org/whisper.cpp/tree/v1.9.4/samples ; project license: https://github.com/ggml-org/whisper.cpp/blob/v1.9.4/LICENSE .

`jfk.mp4` is an AAC audio-only MP4 conversion of that clip. `jfk-video.mp4` combines the same speech with an original solid-color 320×180 video track, generated locally using FFmpeg 9.0.2. The latter ensures decoding handles a real video-plus-audio container, rather than only an audio container with an MP4 extension. The synthetic background carries no teaching information. MP4 fixtures use the built-in AAC encoder; the visual fixture additionally used Apple’s VideoToolbox H.264 encoder and color source filter. Those fixture-generation components are not included in the shipped minimal decoder.

The real integration test exercises all three files with the actual bundled decoder and pinned local Whisper Base/Small models. It checks characteristic speech content, valid time bounds and exact original-byte SHA256 binding. This is a functional regression, not a benchmark of transcription accuracy across languages, accents or recording conditions.

`jfk-delayed.mp4` remuxes the same video and speech with the audio track deliberately delayed by two seconds. It verifies that the decoding stage preserves silence and source timeline position before recognition. Whisper's own segment boundaries can include surrounding silence and remain estimates.
