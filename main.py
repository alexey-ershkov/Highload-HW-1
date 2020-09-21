import logging

from ConnectionPool import ConnectionPool
from Server import Server

logging.basicConfig(level=logging.DEBUG)

# TODO Config file
HOST = 'localhost'
PORT = 3000
ROOT_DIR = '/Users/farcoad/Desktop/http-test-suite'


def init():
    server = Server(HOST, PORT)

    try:
        ConnectionPool(server, ROOT_DIR)
    except KeyboardInterrupt:
        logging.info("Shutting down")


if __name__ == "__main__":
    init()
