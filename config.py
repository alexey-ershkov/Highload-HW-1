import logging
import os

HOST = 'localhost'
PORT = 3000
ROOT_DIR = os.getcwd() + "/http-test-suite"
LOG_LEVEL = logging.INFO
CPU = os.cpu_count()
WORKERS = 0
