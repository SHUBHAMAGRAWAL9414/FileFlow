# LAN File Sharing and Chat Application

This project is a Flask-based web application that provides file sharing and real-time chat functionalities. Users can upload/download files and chat with one another over a local network.

## Features
- **File Sharing**
  - Upload one or more files.
  - List available files with metadata (name, size, type, modified time).
  - Download files.
- **Chat**
  - Real-time chat interface via SocketIO.
  - Chat history retrieval and clearing.
- **User Authentication**
  - Login, logout, and registration routes.

## File Structure
```
uploads6/
├── client.py
├── file_share.db
├── server.py
├── static/
│   ├── chat.css
│   ├── chat.js
│   ├── script.js
│   └── styles.css
├── templates/
│   ├── app.html
│   ├── chat.html
│   └── login.html
├── uploads/
│   └── ... (uploaded files)
├── requirements.txt
└── README.md
```

## Routes

### Authentication Routes
- `/` :  
  - GET: Redirects to `/login` if not authenticated; otherwise renders the main application page.
- `/login` :  
  - GET: Renders the login page.  
  - POST: Authenticates the user.
- `/logout` :  
  - GET: Logs out the user by clearing the session.
- `/register` :  
  - POST: Registers a new user.

### File Sharing Routes
- `/files` :  
  - GET: Returns a JSON list of uploaded files with metadata.
- `/upload` :  
  - POST: Handles file upload (supports multiple file uploads).
- `/download/<filename>` :  
  - GET: Downloads the specified file.

### Chat Routes
- `/chat` :  
  - GET: Renders the chat page.
- `/chat/history` :  
  - GET: Returns the last 100 chat messages.
- `/chat/clear` :  
  - DELETE: Clears the chat history.

### SocketIO Events
- **connect** / **disconnect**: Manages real-time online user count.
- **new_message**: Broadcasts a new chat message.
- **typing** / **stopped_typing**: Sends typing indicators.
- **clear_chat**: Clears the chat history for all users.

## Setup Instructions

1. **Clone the Repository**  
   Navigate to your working folder and clone the repository (or copy the files):

   ```bash
   git clone <repository-url>
   cd uploads6
   ```

2. **Create a Virtual Environment**  
   On Windows:
   ```bash
   python -m venv venv
   venv\Scripts\activate
   ```

3. **Install Dependencies**  
   ```bash
   pip install -r requirements.txt
   ```

4. **Initialize the Database**  
   ```bash
   python -c "from server import init_db; init_db()"
   ```

5. **Run the Application**  
   ```bash
   python server.py
   ```
   The application will run at [http://localhost:5001](http://localhost:5001).

## License

This project is licensed under the MIT License.
