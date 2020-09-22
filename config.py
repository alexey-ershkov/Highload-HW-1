import logging
import multiprocessing
import os

HOST = 'localhost'
PORT = 3000
ROOT_DIR = os.getcwd() + "/http-test-suite"
LOG_LEVEL = logging.DEBUG
CPU_NUM = multiprocessing.cpu_count()
WORKER_NUM = 0
