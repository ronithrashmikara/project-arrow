from fastapi import APIRouter, HTTPException

from app.factors.schemas import (
    FactorCreate,
    FactorUpdate
)

from app.factors.repository import (
    create_factor,
    get_all_factors,
    get_factor_by_id,
    update_factor,
    approve_factor,
    deactivate_factor
)


router = APIRouter(
    prefix="/factors",
    tags=["Emission Factors"]
)


@router.post("")
def add_factor(factor: FactorCreate):
    return create_factor(factor)


@router.get("")
def list_factors():
    return get_all_factors()


@router.get("/{factor_id}")
def get_factor(factor_id: int):
    factor = get_factor_by_id(factor_id)

    if not factor:
        raise HTTPException(
            status_code=404,
            detail="Emission factor not found"
        )

    return factor


@router.patch("/{factor_id}")
def edit_factor(
    factor_id: int,
    factor: FactorUpdate
):
    updated = update_factor(
        factor_id,
        factor
    )

    if not updated:
        raise HTTPException(
            status_code=404,
            detail="Emission factor not found"
        )

    return updated


@router.patch("/{factor_id}/approve")
def approve(
    factor_id: int
):
    updated = approve_factor(
        factor_id
    )

    if not updated:
        raise HTTPException(
            status_code=404,
            detail="Emission factor not found"
        )

    return updated


@router.patch("/{factor_id}/deactivate")
def deactivate(
    factor_id: int
):
    updated = deactivate_factor(
        factor_id
    )

    if not updated:
        raise HTTPException(
            status_code=404,
            detail="Emission factor not found"
        )

    return updated