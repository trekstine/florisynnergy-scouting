"""Shared FastAPI dependencies — current user + role guards."""
from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from . import API_V1_PREFIX
from .database import get_db
from .models import Employee
from .security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{API_V1_PREFIX}/auth/login")

_CRED_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_employee(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Employee:
    try:
        payload = decode_access_token(token)
    except ValueError:
        raise _CRED_EXC
    employee_id = payload.get("eid")
    if employee_id is None:
        raise _CRED_EXC
    employee = await db.get(Employee, int(employee_id))
    if employee is None or not employee.is_active:
        raise _CRED_EXC
    return employee


def require_roles(*roles: str) -> Callable[..., object]:
    allowed = set(roles)

    async def _guard(employee: Employee = Depends(get_current_employee)) -> Employee:
        if employee.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role in {sorted(allowed)}",
            )
        return employee

    return _guard
