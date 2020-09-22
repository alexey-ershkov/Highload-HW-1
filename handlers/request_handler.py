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

    is_dir = False
    path = root_dir + urllib.parse.unquote(urllib.parse.urlparse(req.URL).path)
    if path[-1] == '/':
        is_dir = True
        path += 'index.html'

    resp_code = 200
    if not os.path.exists(path):
        if is_dir:
            resp_code = 403
        else:
            resp_code = 404
    if path.find('../') != -1:
        resp_code = 403
    if resp_code == 200 and req.Method in methods:
        size = os.path.getsize(path)
        resp = models.Response(req.Protocol, req.Method, resp_code, mimetypes.guess_type(path)[0], size)
    else:
        resp = models.Response(req.Protocol, req.Method, resp_code)

    logger.debug(resp_code)

    connection.send(resp.get_raw_headers())
    if req.Method == 'GET' and resp_code == 200:
        file = open(path, 'rb')

        connection.sendfile(file, 0)

    connection.close()

    logger.debug("Connection closed")
