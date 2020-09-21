import mimetypes
import os
import socket

import models


def handle_request(connection: socket.socket, address, logger, root_dir):
    logger.debug("Connected %r at %r", connection, address)
    try:
        req = models.Request(connection.recv(1024))
    except IndexError:
        connection.close()
        logger.debug("Connection closed")
        return

    print(req)
    path = root_dir + req.URL
    if path[-1] == '/':
        path += 'index.html'
    file = open(path, 'rb')
    size = os.path.getsize(path)
    resp = models.Response(req.Protocol, req.Method, 200, mimetypes.guess_type(path)[0], size)
    print(resp)
    connection.send(resp.get_raw_headers())
    connection.send(b'\r\n')
    connection.sendfile(file, 0)
    connection.close()
    logger.debug("Connection closed")
