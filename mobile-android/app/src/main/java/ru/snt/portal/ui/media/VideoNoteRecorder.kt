package ru.snt.portal.ui.media

import android.content.Intent
import android.provider.MediaStore

object VideoNoteRecorder {
    fun createCaptureIntent(maxDurationSec: Int = 60): Intent {
        return Intent(MediaStore.ACTION_VIDEO_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_DURATION_LIMIT, maxDurationSec)
            putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 1)
        }
    }
}

