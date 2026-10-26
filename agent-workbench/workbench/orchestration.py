"""Optional bounded parallelism experiment; not a durable multi-agent runtime."""
import asyncio
from dataclasses import dataclass
from typing import Awaitable, Callable


@dataclass(frozen=True)
class Job:
    id: str
    deps: frozenset[str]


def layers(jobs: list[Job]) -> list[list[Job]]:
    ids={j.id for j in jobs}
    if len(ids)!=len(jobs):
        raise ValueError("duplicate id")
    if any(not j.deps<=ids for j in jobs):
        raise ValueError("missing dependency")
    remaining={j.id:j for j in jobs}
    completed=set()
    order=[]
    while remaining:
        ready=sorted((j for j in remaining.values() if j.deps<=completed),key=lambda j:j.id)
        if not ready:
            raise ValueError("dependency cycle")
        order.append(ready)
        for job in ready:
            completed.add(job.id)
            remaining.pop(job.id)
    return order


async def execute(jobs: list[Job], worker: Callable[[Job],Awaitable[dict]]) -> dict:
    results={}
    for batch in layers(jobs):
        answers=await asyncio.gather(*(worker(job) for job in batch), return_exceptions=True)
        for job,answer in zip(batch,answers):
            if isinstance(answer,BaseException) or not answer.get("ok",False):
                return {"status":"partial","completed":results,"blocked":job.id}
            results[job.id]=answer["value"]
    return {"status":"completed","completed":results}
