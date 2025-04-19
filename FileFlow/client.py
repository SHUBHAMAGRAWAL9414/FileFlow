import socket

# Server configuration
HOST = '127.0.0.1'  # Localhost (same as server)
PORT = 5001  # Must match the server's port

# Create a TCP socket
client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
client_socket.connect((HOST, PORT))  # Connect to server

# Get filename from user
filename = input("Enter the filename to send: ")
client_socket.send(filename.encode())  # Send filename to server

# Send file data
with open(filename, 'rb') as file:
    while chunk := file.read(1024):  # Read in 1024-byte chunks
        client_socket.send(chunk)

print("File sent successfully!")
client_socket.close()
