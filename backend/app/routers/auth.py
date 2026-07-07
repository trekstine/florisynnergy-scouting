"""Authentication + employee management."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_employee, require_roles
from ..models import Employee
from ..schemas import (
    EmployeeCreate,
    EmployeeOut,
    EmployeeUpdate,
    LoginRequest,
    TokenResponse,
)
from ..security import create_access_token, hash_secret, verify_secret

router = APIRouter(prefix="/auth", tags=["auth"])
emp_router = APIRouter(prefix="/employees", tags=["employees"])


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    employee = (
        await db.execute(
            select(Employee).where(
                Employee.device_identifier == payload.device_identifier
            )
        )
    ).scalar_one_or_none()
    if (
        employee is None
        or not employee.is_active
        or not verify_secret(payload.pin, employee.pin_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid device identifier or PIN",
        )
    token = create_access_token(
        subject=employee.device_identifier or str(employee.id),
        role=employee.role,
        employee_id=employee.id,
    )
    return TokenResponse(
        access_token=token,
        employee_id=employee.id,
        name=employee.name,
        role=employee.role,
    )


@router.get("/me", response_model=EmployeeOut)
async def me(current: Employee = Depends(get_current_employee)):
    return current


@emp_router.get("", response_model=list[EmployeeOut])
async def list_employees(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
):
    return (await db.execute(select(Employee).order_by(Employee.id))).scalars().all()


@emp_router.post("", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
async def create_employee(
    payload: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    emp = Employee(
        name=payload.name,
        role=payload.role,
        device_identifier=payload.device_identifier,
        pin_hash=hash_secret(payload.pin) if payload.pin else None,
    )
    db.add(emp)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "device_identifier must be unique")
    await db.refresh(emp)
    return emp


@emp_router.patch("/{employee_id}", response_model=EmployeeOut)
async def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    emp = await db.get(Employee, employee_id)
    if emp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    if payload.name is not None:
        emp.name = payload.name
    if payload.role is not None:
        emp.role = payload.role
    if payload.device_identifier is not None:
        emp.device_identifier = payload.device_identifier
    if payload.is_active is not None:
        emp.is_active = payload.is_active
    if payload.pin is not None:
        emp.pin_hash = hash_secret(payload.pin)
    await db.commit()
    await db.refresh(emp)
    return emp
