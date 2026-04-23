#!/usr/bin/env python
from pathlib import Path

from setuptools import setup, find_packages

with open("freemace/__init__.py") as file:
    for line in file.readlines():
        if "__version__" in line:
            version = line.split("=")[1].strip().replace('"', "")
            break

extra_requires = {"plugins": ["importlib_resources"]}
extra_requires["all"] = sorted(set(sum(extra_requires.values(), [])))

setup(
    name="freemace",
    version=version,
    extras_require=extra_requires,
    description="Freelance budgeting app",
    long_description=(Path(__file__).parent / "README.rst").read_text(),
    author="Delaunay",
    author_email="anony@mous.com",
    license="BSD 3-Clause License",
    url="https://freemace.readthedocs.io",
    classifiers=[
        "License :: OSI Approved :: BSD License",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Operating System :: OS Independent",
    ],
    packages=find_packages(exclude=["tests*", "docs*", "examples*"]),
    setup_requires=["setuptools"],
    install_requires=[
        "importlib_resources",
        "fastapi",
        "uvicorn[standard]",
    ],
    entry_points={
        "console_scripts": [
            "freemace=freemace.server.main:main",
        ],
    },
    package_data={
        "freemace.server": [
            "static/**/*",
            "static/*",
        ],
        "freemace.data": [
            "*.json",
        ],
    },
    include_package_data=True,
)
