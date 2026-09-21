| Measurement | Windows-Ultra7-266V-16GB-busy, 1× |
| --- | ---: |
| Dashboard first load (ms) | 4,807 (n=1) |
| Dashboard warm reload (ms) | 1,854 / 2,125 |
| Global search (ms) | 432 / 605 |
| Open course (ms) | 1,763 / 1,861 |
| Open Cards (ms) | 2,425 / 3,176 |
| Filter Cards (ms) | 272 / 296 |
| Open study (ms) | 1,982 / 2,149 |
| Reveal answer (ms) | 556 / 580 |
| Answer input to readable (ms) | 439 / 455 |
| Grade and show next Card (ms) | 742 / 874 |
| Grade input to readable (ms) | 654 / 745 |
| Burst reveal answer (ms) | 546 / 635 |
| Burst answer input to readable (ms) | 439 / 454 |
| Burst grade and show next Card (ms) | 731 / 747 |
| Burst grade input to readable (ms) | 641 / 651 |
| Export backup (ms) | 7,130 (n=1) |
| Preview backup (ms) | 697 (n=1) |
| Replace from backup (ms) | 38,429 (n=1) |
| Largest sampled JS heap (MiB) | 508 |
| Minimum guest available RAM (MiB) | — |
| Maximum guest swap used (MiB) | — |
| Guest OOM kills during measurements | — |
| Recorded errors | 0 |

Timing cells show median / slowest observed. First load and each backup operation are single measurements (n=1). Other regular operations have five samples, warm reload has four, and each burst operation has ten. These small samples cannot establish a guaranteed worst case or p99.
JavaScript heap is sampled at operation boundaries, not total application memory. Linux memory is whole-guest memory sampled every 500 ms.
