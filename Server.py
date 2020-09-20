import logging
import socket

BUFF_SIZE = 1024


# class Server:
#     def __init__(self, host, port):
#         self.__server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
#         self.__server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
#         self.__server_socket.bind((host, port))
#         self.__server_socket.listen()
#         self.__client = None
#
#         print('Server is running now on', host, port)
#
#     def get_request(self):
#         self.__client, addr = self.__server_socket.accept()
#         return self.__client.recv(BUFF_SIZE)
#
#     def close_conn(self):
#         self.__client.close()
#
#     def send_response(self, response: models.Response):
#         self.__client.send(response.get_raw_headers())
#         self.__client.send('\nTest message'.encode())

class Server:
    def __init__(self, hostname, port):
        self._logger = logging.getLogger("server")
        self._hostname = hostname
        self._port = port
        self._socket = None

    def start(self, connection_pool):
        self._socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._socket.bind((self._hostname, self._port))
        self._socket.listen()

        while True:
            self._logger.debug("Waiting connection")
            conn, address = self._socket.accept()
            self._logger.debug("Got connection and Send it to Queue")
            connection_pool.put((conn, address), False)
