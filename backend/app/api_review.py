from fastapi import APIRouter
from pydantic import BaseModel
from app.agents import review_text

router = APIRouter()


class ReviewIn(BaseModel):
    draft: str


@router.post("/review")
def review(body: ReviewIn):
    return review_text(body.draft)

from app.self_correct import self_correct


@router.post("/self-correct")
def self_correct_endpoint(body: ReviewIn):
    return self_correct(body.draft)