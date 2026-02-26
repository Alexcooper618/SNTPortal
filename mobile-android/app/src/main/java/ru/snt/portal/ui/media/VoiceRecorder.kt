package ru.snt.portal.ui.media

import android.content.Context
import android.media.MediaRecorder
import java.io.File
import kotlin.math.roundToInt

data class VoiceRecordingResult(
    val file: File,
    val durationSec: Int,
    val mimeType: String = "audio/mp4",
)

class VoiceRecorder {
    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null
    private var startedAtMs: Long = 0L

    fun start(context: Context): Result<Unit> {
        if (recorder != null) return Result.failure(IllegalStateException("Recorder already running"))

        return runCatching {
            val file = File(context.cacheDir, "voice-${System.currentTimeMillis()}.m4a")
            val mediaRecorder = MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setOutputFile(file.absolutePath)
                prepare()
                start()
            }
            recorder = mediaRecorder
            outputFile = file
            startedAtMs = System.currentTimeMillis()
        }
    }

    fun stop(): VoiceRecordingResult? {
        val currentRecorder = recorder ?: return null
        val file = outputFile ?: return null

        return runCatching {
            currentRecorder.stop()
            currentRecorder.release()
            recorder = null
            outputFile = null
            val elapsedSec = ((System.currentTimeMillis() - startedAtMs) / 1000f).roundToInt().coerceAtLeast(1)
            VoiceRecordingResult(
                file = file,
                durationSec = elapsedSec,
            )
        }.getOrElse {
            runCatching { currentRecorder.release() }
            recorder = null
            outputFile = null
            runCatching { file.delete() }
            null
        }
    }

    fun cancel() {
        val currentRecorder = recorder
        val file = outputFile
        if (currentRecorder != null) {
            runCatching { currentRecorder.stop() }
            runCatching { currentRecorder.release() }
        }
        recorder = null
        outputFile = null
        if (file != null) {
            runCatching { file.delete() }
        }
    }
}

