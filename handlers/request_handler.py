def handle_request(connection, address, logger):
    logger.debug("Connected %r at %r", connection, address)
    while True:
        data = connection.recv(1024)
        if data == b"":
            logger.debug("Socket closed remotely")
            break
        logger.debug("Received data %r", data)
        connection.sendall(data)
        logger.debug("Sent data")
    # logger.debug("Connected %r at %r", connection, address)
    # req = models.Request(connection.recv(1024))
    # print(req)
    # resp = models.Response(req.Protocol, req.Method, 200)
    # print(resp)
    # connection.send(resp.get_raw_headers())
    # connection.close()
