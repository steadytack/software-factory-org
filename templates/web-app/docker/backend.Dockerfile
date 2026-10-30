FROM python:3.12-slim AS builder

ENV POETRY_VIRTUALENVS_IN_PROJECT=true

RUN pip install --no-cache-dir "poetry>=2,<3"

WORKDIR /app
# Install exactly what poetry.lock pins. The build used to run `poetry lock`
# here, re-resolving every ">=" range on each build, so two builds of the
# same commit could ship different dependency versions. Update the lock
# deliberately (`poetry lock`) and commit it.
COPY pyproject.toml poetry.lock ./
RUN poetry install --without dev --no-root

FROM python:3.12-slim AS runtime

RUN useradd --create-home --uid 1000 appuser

# Pre-create the attachments volume mount-point with correct ownership so a
# fresh named volume (which inherits the image directory's ownership) is
# writable by the app user without a manual chown.
RUN mkdir -p /data/uploads && chown -R appuser:appuser /data

WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY . /app

ENV PATH="/app/.venv/bin:$PATH"

USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
