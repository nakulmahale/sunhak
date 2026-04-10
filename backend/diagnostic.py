import sys
try:
    import pandas
    print(f"pandas version: {pandas.__version__}")
except ImportError:
    print("pandas MISSING")

try:
    import sklearn
    print(f"sklearn version: {sklearn.__version__}")
except ImportError:
    print("sklearn MISSING")

print(f"Python version: {sys.version}")
