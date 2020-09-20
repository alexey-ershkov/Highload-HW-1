import models


def handle_request(connection, address, logger):
    # logger.debug("Connected %r at %r", connection, address)
    # while True:
    #     data = connection.recv(1024)
    #     if data == b"":
    #         logger.debug("Socket closed remotely")
    #         break
    #     logger.debug("Received data %r", data)
    #     connection.sendall(data)
    #     logger.debug("Sent data")
    logger.debug("Connected %r at %r", connection, address)
    try:
        req = models.Request(connection.recv(1024))
    except IndexError:
        connection.close()
        logger.debug("Connection closed")
        return

    print(req)
    resp = models.Response(req.Protocol, req.Method, 200, "text/plain", "Something")
    print(resp)
    connection.send(resp.get_raw_headers())
    if resp.Body:
        connection.send(resp.get_raw_body())
    connection.close()
    logger.debug("Connection closed")
