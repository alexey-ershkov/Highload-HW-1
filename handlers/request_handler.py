import mimetypes
import os
import socket
import urllib.parse

import models

methods = ['GET', 'HEAD']


def handle_request(connection: socket.socket, address, logger, root_dir):
    logger.debug("Connected at %r", address)
    try:
        req = models.Request(connection.recv(1024))
    except IndexError:
        connection.send(b'Non HTTP protocol used')
        connection.close()
        logger.debug("Connection closed")
        return

    resp_code = 200
    message = "Thread Pool Server\n"
    resp = models.Response(req.Protocol, req.Method, resp_code, 'text/html', len(message))

    logger.debug(resp_code)

    connection.sendall(resp.get_raw_headers())
    if req.Method == 'GET' and resp_code == 200:
        connection.send(message.encode('utf-8'))
        connection.shutdown(socket.SHUT_RDWR)

    connection.shutdown(socket.SHUT_RDWR)

    logger.debug("Connection closed")

