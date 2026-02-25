package ru.snt.portal.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import okhttp3.MultipartBody
import ru.snt.portal.core.model.ApiResult
import ru.snt.portal.core.model.NewsPost
import ru.snt.portal.core.model.NewsStoryGroup
import ru.snt.portal.core.repository.NewsRepository
import javax.inject.Inject

data class NewsUiState(
    val loadingFeed: Boolean = true,
    val loadingStories: Boolean = true,
    val publishing: Boolean = false,
    val publishingStory: Boolean = false,
    val feed: List<NewsPost> = emptyList(),
    val stories: List<NewsStoryGroup> = emptyList(),
    val postDraft: String = "",
    val error: String? = null,
    val notice: String? = null,
)

@HiltViewModel
class NewsViewModel @Inject constructor(
    private val newsRepository: NewsRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(NewsUiState())
    val uiState: StateFlow<NewsUiState> = _uiState.asStateFlow()

    init {
        refresh(force = false)
    }

    fun onPostDraftChanged(value: String) {
        _uiState.update { it.copy(postDraft = value, error = null, notice = null) }
    }

    fun clearNotice() {
        _uiState.update { it.copy(notice = null) }
    }

    fun refresh(force: Boolean = true) {
        loadStories(force)
        loadFeed(force)
    }

    fun loadStories(force: Boolean = true) {
        viewModelScope.launch {
            val hasExisting = _uiState.value.stories.isNotEmpty()
            _uiState.update { it.copy(loadingStories = force || !hasExisting, error = null) }
            when (val result = newsRepository.loadStories(force = force)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            loadingStories = false,
                            stories = result.data,
                            error = null,
                        )
                    }
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(loadingStories = false, error = result.message) }
                }
            }
        }
    }

    private fun loadFeed(force: Boolean = true) {
        viewModelScope.launch {
            val hasExisting = _uiState.value.feed.isNotEmpty()
            _uiState.update { it.copy(loadingFeed = force || !hasExisting, error = null) }
            when (val result = newsRepository.loadFeed(force = force)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            loadingFeed = false,
                            feed = result.data,
                            error = null,
                        )
                    }
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(loadingFeed = false, error = result.message) }
                }
            }
        }
    }

    fun publishPost(media: List<MultipartBody.Part> = emptyList()) {
        val text = _uiState.value.postDraft.trim()
        if (text.isBlank()) {
            _uiState.update { it.copy(error = "Введите текст поста") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(publishing = true, error = null, notice = null) }
            when (val result = newsRepository.createPost(text, media)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            publishing = false,
                            postDraft = "",
                            feed = listOf(result.data) + it.feed.filterNot { post -> post.id == result.data.id },
                            notice = "Пост опубликован",
                        )
                    }
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(publishing = false, error = result.message) }
                }
            }
        }
    }

    fun publishStory(
        media: MultipartBody.Part,
        caption: String? = null,
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(publishingStory = true, error = null, notice = null) }
            when (val result = newsRepository.createStory(caption = caption, media = media)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            publishingStory = false,
                            notice = "История опубликована",
                        )
                    }
                    loadStories(force = true)
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(publishingStory = false, error = result.message) }
                }
            }
        }
    }

    fun markStoryViewed(storyId: String) {
        viewModelScope.launch {
            when (newsRepository.markStoryViewed(storyId)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            stories = it.stories.map { group ->
                                val updated = group.stories.map { story ->
                                    if (story.id == storyId) story.copy(viewedByMe = true) else story
                                }
                                group.copy(
                                    stories = updated,
                                    hasUnseen = updated.any { story -> !story.viewedByMe },
                                )
                            },
                        )
                    }
                }

                is ApiResult.Error -> Unit
            }
        }
    }

    fun toggleLike(post: NewsPost) {
        viewModelScope.launch {
            when (val result = newsRepository.toggleLike(post)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(feed = it.feed.map { current -> if (current.id == post.id) result.data else current })
                    }
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(error = result.message) }
                }
            }
        }
    }
}
