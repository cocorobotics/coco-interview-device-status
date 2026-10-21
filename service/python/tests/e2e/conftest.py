import pytest

from stack import isolate_test, resume_traffic


@pytest.fixture
def isolated():
    isolate_test()
    yield
    resume_traffic()
