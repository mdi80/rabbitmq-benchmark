[
  {
    "name": "stage1_rate_1000",
    "type": "simple",
    "uri": "amqp://127.0.0.1:5672",
    "params": [
      {
        "time-limit": 8,
        "producer-count": 1,
        "consumer-count": 2,
        "producer-rate-limit": 1000,
        "min-msg-size": 256
      }
    ]
  },
  {
    "name": "stage2_rate_5000",
    "type": "simple",
    "uri": "amqp://127.0.0.1:5672",
    "params": [
      {
        "time-limit": 8,
        "producer-count": 1,
        "consumer-count": 2,
        "producer-rate-limit": 5000,
        "min-msg-size": 256
      }
    ]
  },
  {
    "name": "stage3_rate_12000",
    "type": "simple",
    "uri": "amqp://127.0.0.1:5672",
    "params": [
      {
        "time-limit": 8,
        "producer-count": 2,
        "consumer-count": 2,
        "producer-rate-limit": 12000,
        "min-msg-size": 256
      }
    ]
  },
  {
    "name": "stage4_rate_20000",
    "type": "simple",
    "uri": "amqp://127.0.0.1:5672",
    "params": [
      {
        "time-limit": 8,
        "producer-count": 3,
        "consumer-count": 2,
        "producer-rate-limit": 20000,
        "min-msg-size": 256
      }
    ]
  },
  {
    "name": "stage5_rate_28000",
    "type": "simple",
    "uri": "amqp://127.0.0.1:5672",
    "params": [
      {
        "time-limit": 8,
        "producer-count": 4,
        "consumer-count": 2,
        "producer-rate-limit": 28000,
        "min-msg-size": 256
      }
    ]
  }
]