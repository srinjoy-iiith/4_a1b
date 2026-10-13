# Users of GigTask

## 1. Client (the person hiring)

A small-business owner or individual who posts gigs and pays freelancers through escrow.

| They want to… | Screen |
|---|---|
| See their escrow balance and past contracts | Browse → client detail, top-bar balance |
| Find an available worker close to the job site | Nearby Workers (map) |
| Check a worker's portfolio and reviews before hiring | Freelancer detail, Reviews |
| Fund a gig, and know clearly if it failed and why | Fund a Gig |
| Top up escrow when the balance runs out | Fund a Gig → Top up |
| See every rupee that moved in or out of escrow | Escrow Audit |
| Mark a gig as started or completed | Contract detail |

## 2. Platform analyst / admin

Someone at GigTask who watches how the marketplace is doing.

| They want to… | Screen |
|---|---|
| Browse every client, freelancer and contract, even at 50k+ rows | Browse (paged, searchable, filterable) |
| See which freelancers earn the most right now | Analytics → ranking (DENSE_RANK) |
| See revenue trends per freelancer | Analytics → 7-day moving average chart |
| Get lifetime totals quickly, and refresh them on demand | Analytics → materialized-view summary |
| Understand service quality and popular skills | Reviews (rating distribution, top tags) |

## Demo note

There is no real login. The **"Acting as"** box in the top bar switches which client you are. The analyst screens are open to everyone.
