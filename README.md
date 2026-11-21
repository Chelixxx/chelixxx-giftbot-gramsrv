# VOLTRA Railway server

This repository builds the VOLTRA-compatible gramsrv server image from a pinned public upstream commit, with a small MTProto advertised-port patch and Railway persistent-volume startup handling.

The Railway service uses this repository's Dockerfile. Mutable RSA identity, media blobs, and server identity files are stored under the mounted `/var/lib/telesrv` volume. The public TCP proxy is configured separately in Railway.
