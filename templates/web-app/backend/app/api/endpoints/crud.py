"""Generic CRUD router factory.

The domain endpoint files (sites, surveys, …) repeated the
same five routes with only names, types and the ParentNotFoundError mapping
differing. `make_crud_router` builds them; entities with extra list filters
pass an `extra_list_params` dict of Query defaults.
"""

import inspect
import uuid
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.search import clean_search
from app.core.auth import get_current_subject, require_admin_optional, require_role
from app.core.database import SessionDep
from app.services.base import ParentNotFoundError


def make_crud_router(
    *,
    prefix: str,
    tags: list[str],
    service_factory: Callable[..., Any],
    read_schema: type,
    list_schema: type,
    create_schema: type,
    update_schema: type,
    entity_label: str,
    # Extra query params for the list route:
    # {param_name: (Query(...), python_name)} or
    # {param_name: (Query(...), python_name, python_type)}
    extra_list_params: dict[str, Any] | None = None,
    # Minimum role to create/update, and to delete (see schemas.enums.USER_ROLES).
    write_role: str = "editor",
    delete_role: str = "admin",
) -> APIRouter:
    # Reads require authentication — and writes require admin, which
    # transitively requires auth. Applying it at the router level means every
    # generated route is guarded, including any added later. get_current_subject
    # is dependency-cached per request, so write routes don't pay a second
    # session lookup for the same check require_admin already performs.
    router = APIRouter(
        prefix=prefix,
        tags=[tags[0]] if tags else None,
        dependencies=[Depends(get_current_subject)],
    )
    extra_list_params = extra_list_params or {}
    can_write = require_role(write_role)
    can_delete = require_role(delete_role)

    def get_service(
        session=SessionDep,
        actor: str = Depends(require_admin_optional),
    ) -> Any:
        return service_factory(session, actor)

    @router.post("", response_model=read_schema, status_code=status.HTTP_201_CREATED)
    async def create_entity(
        data: create_schema,  # type: ignore[valid-type]
        service: Any = Depends(get_service),
        _writer: str = Depends(can_write),
    ) -> Any:
        try:
            return await service.create(data)
        except ParentNotFoundError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc

    # Build the list route dynamically so extra query params (site_id,
    # survey_id, status…) appear in OpenAPI exactly as before.
    # FastAPI inspects the handler's signature to build its params, so extra
    # params must be real named parameters, not **kwargs — we satisfy that by
    # constructing an inspect.Signature and attaching it to a **kwargs
    # function, rather than exec()'ing generated source.
    extra_items = list((extra_list_params or {}).items())
    if extra_items:

        async def list_entities(**kwargs: Any) -> Any:
            if "q" in kwargs:
                kwargs["q"] = clean_search(kwargs["q"])
            return await kwargs.pop("service").list(**kwargs)

        params = [
            inspect.Parameter(
                "offset",
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                default=Query(default=0, ge=0),
                annotation=int,
            ),
            inspect.Parameter(
                "limit",
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                default=Query(default=50, ge=1, le=200),
                annotation=int,
            ),
            inspect.Parameter(
                "service",
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                default=Depends(get_service),
                annotation=Any,
            ),
        ]
        for name, spec in extra_items:
            params.append(
                inspect.Parameter(
                    name,
                    inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    default=spec[0],
                    annotation=spec[2] if len(spec) > 2 else uuid.UUID,
                )
            )
        list_entities.__signature__ = inspect.Signature(params)
    else:

        async def list_entities(
            offset: int = Query(default=0, ge=0),
            limit: int = Query(default=50, ge=1, le=200),
            service: Any = Depends(get_service),
        ) -> Any:
            return await service.list(offset=offset, limit=limit)

    router.get("", response_model=list_schema)(list_entities)

    @router.get("/{entity_id}", response_model=read_schema)
    async def get_entity(
        entity_id: uuid.UUID,
        service: Any = Depends(get_service),
    ) -> Any:
        obj = await service.get(entity_id)
        if obj is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"{entity_label} not found")
        return obj

    @router.patch("/{entity_id}", response_model=read_schema)
    async def update_entity(
        entity_id: uuid.UUID,
        data: update_schema,  # type: ignore[valid-type]
        service: Any = Depends(get_service),
        _writer: str = Depends(can_write),
    ) -> Any:
        try:
            obj = await service.update(entity_id, data)
        except ParentNotFoundError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
        if obj is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"{entity_label} not found")
        return obj

    @router.delete("/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_entity(
        entity_id: uuid.UUID,
        service: Any = Depends(get_service),
        _deleter: str = Depends(can_delete),
    ) -> None:
        if not await service.delete(entity_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"{entity_label} not found")

    return router
