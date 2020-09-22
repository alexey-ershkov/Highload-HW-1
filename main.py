import logging

import config
from ConnectionPool import ConnectionPool
from Server import Server

logging.basicConfig(level=config.LOG_LEVEL)


def init():
    server = Server(config.HOST, config.PORT)

    try:
        ConnectionPool(server, config.ROOT_DIR)
    except KeyboardInterrupt:
        logging.info("Shutting down")


if __name__ == "__main__":
    init()
