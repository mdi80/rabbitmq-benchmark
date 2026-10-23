[
  {
    "name": "custom_20msg_s_2p_1c",
    "type": "simple",
    "uri": "amqp://127.0.0.1:5672",
    "params": [
      {
        "time-limit": 10,
        "producer-count": 2,
        "consumer-count": 1,
        "min-msg-size": 256,
        "producer-rate-limit": 20
      }
    ]
  }
]