document.addEventListener("DOMContentLoaded", function() {
    // Global state
    const state = {
        files: [],
        activeUploads: 0,
        sortBy: 'name',
        sortDirection: 1
    };

    // Initialize components
    initDragAndDrop();
    initUploadButton();
    initSearch();
    initSorting();
    loadFiles();

    /* ===== FILE SHARING FUNCTIONS ===== */
    function initDragAndDrop() {
        const dropArea = document.getElementById('dropArea');
        const fileInput = document.getElementById('fileInput');

        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, unhighlight, false);
        });

        dropArea.addEventListener('drop', handleDrop, false);
        fileInput.addEventListener('change', handleFileSelect, false);

        function highlight(e) {
            e.preventDefault();
            e.stopPropagation();
            dropArea.classList.add('drag-over');
        }

        function unhighlight(e) {
            e.preventDefault();
            e.stopPropagation();
            dropArea.classList.remove('drag-over');
        }

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            handleFiles(files);
        }

        function handleFileSelect(e) {
            const files = e.target.files;
            handleFiles(files);
        }

        function handleFiles(files) {
            if (files.length > 0) {
                showPreviews(files);
            }
        }
    }

    function showPreviews(files) {
        const container = document.getElementById('previewContainer');
        container.innerHTML = '';

        Array.from(files).forEach(file => {
            if (!file.type) return;

            const preview = document.createElement('div');
            preview.className = 'file-preview';
            
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    preview.innerHTML = `
                        <img src="${e.target.result}" class="preview-image">
                        <div class="preview-content">
                            <div>${file.name}</div>
                            <div>${formatSize(file.size)}</div>
                        </div>
                    `;
                };
                reader.readAsDataURL(file);
            } 
            else if (file.type === 'application/pdf') {
                preview.innerHTML = `
                    <div class="preview-content" style="text-align: center; padding: 20px 10px;">
                        <i class="fas fa-file-pdf" style="font-size: 2em; color: #e74c3c;"></i>
                        <div style="margin-top: 5px;">${file.name}</div>
                        <div>${formatSize(file.size)}</div>
                    </div>
                `;
            }
            else {
                preview.innerHTML = `
                    <div class="preview-content" style="text-align: center; padding: 20px 10px;">
                        <i class="fas fa-file"></i>
                        <div style="margin-top: 5px;">${file.name}</div>
                        <div>${formatSize(file.size)}</div>
                    </div>
                `;
            }

            container.appendChild(preview);
        });
    }

    function initUploadButton() {
        document.getElementById('uploadButton').addEventListener('click', startUpload);
    }

    function startUpload() {
        const files = document.getElementById('fileInput').files;

        if (files.length === 0) {
            showAlert('No files selected', 'error');
            return;
        }

        uploadFiles(files);
    }

    function uploadFiles(files) {
        const uploadContainer = document.getElementById('uploadProgress');
        uploadContainer.innerHTML = '';

        Array.from(files).forEach((file, index) => {
            uploadFile(file, uploadContainer, index);
        });
    }

    function uploadFile(file, container, index) {
        const formData = new FormData();
        formData.append('file', file);

        const progressId = `progress-${Date.now()}-${index}`;
        const progressHTML = `
            <div class="file-progress" id="${progressId}">
                <div class="file-progress-header">
                    <span>${file.name}</span>
                    <span class="progress-percent">0%</span>
                </div>
                <div class="progress-container">
                    <div class="progress-bar"></div>
                </div>
                <div class="progress-info">
                    <span class="speed">0 KB/s</span>
                    <span class="eta">-</span>
                    <span class="status">Uploading...</span>
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', progressHTML);
        const progressElement = document.getElementById(progressId);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/upload', true);

        const startTime = Date.now();
        let lastLoaded = 0;
        let lastTime = startTime;
        let speeds = [];

        xhr.upload.onprogress = (e) => {
            const currentTime = Date.now();
            const timeDiff = (currentTime - lastTime) / 1000;
            
            if (timeDiff > 0) {
                const loadedDiff = e.loaded - lastLoaded;
                const currentSpeed = loadedDiff / timeDiff;
                speeds.push(currentSpeed);
                
                if (speeds.length > 5) speeds.shift();
                
                const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
                const speedKB = avgSpeed / 1024;
                
                const elapsed = (currentTime - startTime) / 1000;
                const remainingBytes = e.total - e.loaded;
                const eta = remainingBytes / avgSpeed;
                
                const progress = (e.loaded / e.total) * 100;
                
                progressElement.querySelector('.progress-bar').style.width = `${progress}%`;
                progressElement.querySelector('.progress-percent').textContent = `${progress.toFixed(1)}%`;
                progressElement.querySelector('.speed').textContent = `${speedKB.toFixed(1)} KB/s`;
                progressElement.querySelector('.eta').textContent = `ETA: ${formatTime(eta)}`;
                
                lastLoaded = e.loaded;
                lastTime = currentTime;
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                progressElement.querySelector('.status').textContent = 'Completed';
                progressElement.querySelector('.status').style.color = 'var(--primary)';
                progressElement.style.opacity = '0.7';
                
                setTimeout(() => {
                    progressElement.remove();
                }, 2000);
                
                loadFiles();
            } else {
                progressElement.querySelector('.status').textContent = 'Failed: ' + xhr.responseText;
                progressElement.querySelector('.status').style.color = '#e74c3c';
            }
            
            state.activeUploads--;
            if (state.activeUploads === 0) {
                document.getElementById('fileInput').value = '';
                document.getElementById('previewContainer').innerHTML = '';
            }
        };

        xhr.onerror = () => {
            progressElement.querySelector('.status').textContent = 'Upload failed';
            progressElement.querySelector('.status').style.color = '#e74c3c';
            state.activeUploads--;
        };

        state.activeUploads++;
        xhr.send(formData);
    }

    function initSearch() {
        document.getElementById('searchInput').addEventListener('input', () => {
            renderFiles();
        });
    }

    function initSorting() {
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.sort-btn').forEach(b => {
                    b.classList.remove('active');
                });
                this.classList.add('active');
                
                state.sortBy = this.dataset.sort;
                state.sortDirection = this.dataset.sort === state.sortBy ? state.sortDirection * -1 : 1;
                
                const icon = this.querySelector('i');
                icon.className = state.sortDirection === 1 ? 
                    'fas fa-sort-amount-down' : 'fas fa-sort-amount-up';
                
                renderFiles();
            });
        });
    }

    function loadFiles() {
        fetch('/files')
            .then(response => {
                if (response.status === 401) {
                    window.location.href = '/';
                    return;
                }
                return response.json();
            })
            .then(files => {
                state.files = files;
                renderFiles();
            })
            .catch(error => {
                showAlert('Failed to load files: ' + error, 'error');
            });
    }

    function renderFiles() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        
        let filteredFiles = state.files.filter(file => 
            file.name.toLowerCase().includes(searchTerm));
        
        filteredFiles.sort((a, b) => {
            let compareValue;
            
            switch (state.sortBy) {
                case 'name':
                    compareValue = a.name.localeCompare(b.name);
                    break;
                case 'size':
                    compareValue = a.size - b.size;
                    break;
                case 'date':
                    compareValue = a.modified - b.modified;
                    break;
                default:
                    compareValue = 0;
            }
            
            return compareValue * state.sortDirection;
        });
        
        document.getElementById('fileCount').textContent = 
            `${filteredFiles.length} file${filteredFiles.length !== 1 ? 's' : ''}`;
        
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';
        
        filteredFiles.forEach(file => {
            const li = document.createElement('li');
            li.innerHTML = `
                <a href="/download/${file.name}" class="file-item">
                    <div class="file-icon">${file.icon}</div>
                    <div class="file-name">${file.name}</div>
                    <div class="file-meta">
                        <span>${formatSize(file.size)}</span>
                        <span>${formatDate(file.modified)}</span>
                    </div>
                </a>
            `;
            fileList.appendChild(li);
        });
    }

    /* ===== UTILITY FUNCTIONS ===== */
    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
    }

    function formatDate(timestamp) {
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
        
        if (diffInDays === 0) {
            return 'Today ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffInDays === 1) {
            return 'Yesterday ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffInDays < 7) {
            return `${diffInDays} days ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    function formatTime(seconds) {
        if (seconds <= 0) return '0s';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        return [hours, minutes, secs]
            .map(v => v > 0 ? v : '')
            .filter(v => v !== '')
            .map((v, i) => {
                if (i === 0) return `${v}h`;
                if (i === 1) return `${v}m`;
                return `${v}s`;
            })
            .join(' ');
    }

    function showAlert(message, type = 'success') {
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.textContent = message;
        
        document.body.appendChild(alert);
        
        setTimeout(() => {
            alert.remove();
        }, 3000);
    }
});