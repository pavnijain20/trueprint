from fastapi import APIRouter
from pydantic import BaseModel
from app.agents import review_text

router = APIRouter()


class ReviewIn(BaseModel):
    draft: str


@router.post("/review")
def review(body: ReviewIn):
    return review_text(body.draft)