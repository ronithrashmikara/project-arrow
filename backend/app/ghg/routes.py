from fastapi import (
    APIRouter,
    HTTPException
)

from app.ghg.schemas import (
    EmissionCalculationRequest
)

from app.ghg.engine import (
    calculate_emissions
)

from app.ghg.units import (
    convert_to_base_unit
)

from app.factors.repository import (
    get_approved_factor_by_code
)


router = APIRouter(
    prefix="/ghg",
    tags=["GHG Engine"]
)


@router.post("/calculate")
def calculate(
    request: EmissionCalculationRequest
):

    factor = get_approved_factor_by_code(
        request.factor_code
    )

    if not factor:
        raise HTTPException(
            status_code=404,
            detail="Approved emission factor not found"
        )

    target_unit = factor[
        "activity_unit"
    ]

    try:
        converted_value = (
            convert_to_base_unit(
                request.activity_value,
                request.activity_unit,
                target_unit
            )
        )

        emissions = calculate_emissions(
            converted_value,
            factor["factor_value"]
        )

        return {
            "activity_value":
                request.activity_value,

            "converted_activity_value":
                converted_value,

            "activity_unit":
                target_unit,

            "factor_code":
                factor["factor_code"],

            "factor_value":
                factor["factor_value"],

            "factor_unit":
                factor["factor_unit"],

            "factor_version":
                factor["version"],

            "emissions_kg_co2e":
                emissions
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )