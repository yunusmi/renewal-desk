# Original provider simulator, unchanged, behind a 0.0.0.0 launcher.
FROM python:3.12.8-alpine3.21
WORKDIR /app
COPY references/company/provider_simulator.py /app/provider_simulator.py
COPY infrastructure/provider/launcher.py /app/launcher.py
RUN adduser -D -H -u 10001 provider && sha256sum /app/provider_simulator.py > /app/provider_simulator.sha256
USER provider
EXPOSE 8091
HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8091/health',timeout=2).status==200 else 1)"
CMD ["python", "-u", "/app/launcher.py"]
