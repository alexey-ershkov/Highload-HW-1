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

    resp_code = 200
    if not os.path.exists(path):
        resp_code = 404
    if path.find('..') != -1:
        resp_code = 403
    if resp_code == 200:
        size = os.path.getsize(path)
        resp = models.Response(req.Protocol, req.Method, resp_code, mimetypes.guess_type(path)[0], size)
    else:
        resp = models.Response(req.Protocol, req.Method, resp_code)

    print(resp)

    connection.send(resp.get_raw_headers())
    connection.send(b'\r\n')
    if req.Method == 'GET' and resp_code == 200:
        file = open(path, 'rb')

        connection.sendfile(file, 0)

    connection.close()

    logger.debug("Connection closed")
