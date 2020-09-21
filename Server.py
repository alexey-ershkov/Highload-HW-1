import logging
import socket

BUFF_SIZE = 1024


class Server:
    def __init__(self, hostname, port):
        self.logger = logging.getLogger("server")
        self.hostname = hostname
        self.port = port
        self.socket = None

    def start(self, connection_pool):
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.bind((self.hostname, self.port))
        self.socket.listen()

        while True:
            self.logger.debug("Waiting connection")
            conn, address = self.socket.accept()
            self.logger.debug("Got connection and Send it to Queue")
            connection_pool.put((conn, address), False)
