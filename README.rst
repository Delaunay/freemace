freemace
=============================

|pypi| |py_versions| |codecov| |docs| |tests| |style|

.. |pypi| image:: https://img.shields.io/pypi/v/freemace.svg
    :target: https://pypi.python.org/pypi/freemace
    :alt: Current PyPi Version

.. |py_versions| image:: https://img.shields.io/pypi/pyversions/freemace.svg
    :target: https://pypi.python.org/pypi/freemace
    :alt: Supported Python Versions

.. |codecov| image:: https://codecov.io/gh/Delaunay/freemace/branch/master/graph/badge.svg?token=40Cr8V87HI
   :target: https://codecov.io/gh/Delaunay/freemace

.. |docs| image:: https://readthedocs.org/projects/freemace/badge/?version=latest
   :target:  https://freemace.readthedocs.io/en/latest/?badge=latest

.. |tests| image:: https://github.com/Delaunay/freemace/actions/workflows/test.yml/badge.svg?branch=master
   :target: https://github.com/Delaunay/freemace/actions/workflows/test.yml

.. |style| image:: https://github.com/Delaunay/freemace/actions/workflows/style.yml/badge.svg?branch=master
   :target: https://github.com/Delaunay/freemace/actions/workflows/style.yml


A self-hosted freelance budgeting app with a React UI, FastAPI backend,
automatic git backup to GitHub, and over-the-air updates from PyPI.


Quick Install
-------------

One-liner that sets up everything (venv, service, auto-start):

.. code-block:: bash

   curl -sSL https://raw.githubusercontent.com/Delaunay/freemace/master/install.sh | bash

This will:

* Create ``/opt/freemace/`` with a Python venv and data directory
* Install `uv <https://github.com/astral-sh/uv>`_ if not already available
* Install the latest ``freemace`` package from PyPI
* Start a systemd user service on port **5002**

After installation, open http://localhost:5002 in your browser.


Manual Install
--------------

.. code-block:: bash

   pip install freemace

Then run the server:

.. code-block:: bash

   freemace serve --port 5002


Configuration
-------------

After installing, you can configure git backup and auto-updates from the
**Settings** page in the web UI, or via the CLI:

.. code-block:: bash

   # Set up automatic git backup to GitHub
   freemace setup-git git@github.com:username/freemace-data.git

   # Check for and install updates
   freemace update --restart

   # View or change configuration
   freemace config
   freemace config auto_update true


Useful Commands
---------------

.. code-block:: bash

   systemctl --user status freemace     # check service status
   systemctl --user restart freemace    # restart
   journalctl --user -u freemace -f    # view logs


Features
--------

* Budget spreadsheet with income/expense tracking, categories, and pivot summaries
* CSV import/export
* Dark/light theme
* Automatic git backup to GitHub on every save
* SSH key generation and guided GitHub setup from the UI
* Auto-update from PyPI with service restart
* One-command installation with systemd service
