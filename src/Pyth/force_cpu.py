import os
import tensorflow as tf

# Disable GPU completely
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["TF_METAL_DISABLE"] = "1"

# Ensure TensorFlow only sees the CPU
tf.config.experimental.set_visible_devices([], "GPU")

print("Num GPUs Available:", len(tf.config.list_physical_devices('GPU')))
