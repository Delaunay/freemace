import freemace.plugins
from freemace.core import discover_plugins


def test_plugins():
    plugins = discover_plugins(freemace.plugins)

    assert len(plugins) == 1
