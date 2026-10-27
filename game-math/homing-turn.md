# 타겟 쪽으로 돌기: 외적은 어느 쪽, 내적은 얼마나

> GameMathLab · 과정 1 · 유도 미사일 · 2026-10-27 — 직접 날려 보는 그림은 [homing-turn.html](homing-turn.html)

**회전 하나 = 축 + 각도. 축(어느 쪽으로)은 외적, 각도(얼마나)는 내적을 각도로 되돌려서 구하고, 이번 프레임에는 남은 각도와 최대 회전 중 작은 쪽만큼만 돈다.**

작업자가 정리한 문장: "타겟 쪽을 보려면, 내가 보는 방향과 타겟으로의 방향을 외적해서 어느 쪽으로 돌지 알아내고, 내적으로 얼마나 돌지 구한다."

## 축 + 각도

| 필요한 것 | 무엇으로 | 언리얼 | 유니티 |
|---|---|---|---|
| **어느 쪽으로** (축) | 외적 | `FVector::CrossProduct(A, B)` | `Vector3.Cross(a, b)` |
| **얼마나** (각도) | 내적 → 각도 | `FMath::Acos(Clamp(Dot, -1, 1))` | `Vector3.Angle(a, b)` |
| 합쳐 돌리기 | | `FQuat(축, 라디안)` | `Quaternion.AngleAxis(도, 축)` |

- 내적만 있으면 "30° 차이"까지만 안다. 왼쪽인지 오른쪽인지 위인지는 외적이 정한다 ([레이더 원뿔](radar-cone.md)의 왼쪽 50° = 오른쪽 50°)

## 외적 = 고개를 돌릴 축

| 앞 방향 | 목표 방향 | 외적 (축) | 고개 |
|---|---|---|---|
| (1, 0, 0) | (0, 1, 0) 오른쪽 | (0, 0, 1) 위아래 축 | 옆으로 돌림 |
| (1, 0, 0) | (0, 0, 1) 위 | (0, −1, 0) 좌우 축 | 듦 |

- 외적 결과는 두 방향 모두에 **수직**
- 순서를 바꾸면 축이 반대 → 반대쪽으로 돈다

### 축은 길이 1로

| 사이 각도 | 외적 | 길이 |
|---|---|---|
| 90° | (0, 0, 1) | 1 |
| 30° | (0, 0, 0.5) | 0.5 |
| 1° | (0, 0, 0.017) | 0.017 |

- `FQuat(축, 각도)`는 축이 길이 1이라고 믿는다 (Epic 공식). 얼마나는 각도가 맡으니 축은 `.GetSafeNormal()`로 **방향만**
- 유니티 `Quaternion.AngleAxis`는 안에서 정규화해 준다

## 내적 → 각도: Acos 앞에 Clamp

| 넣은 값 | `FMath::Acos` | 도 |
|---|---|---|
| 1.0 | 0 | 0° |
| 0.0 | 1.571 | 90° |
| −1.0 | 3.142 | 180° |
| 1.0000001 | **NaN** | — |

- 소수 오차로 1을 살짝 넘을 수 있다. 하필 타겟을 거의 정면으로 볼 때. NaN이면 미사일이 사라짐
- 유니티 `Vector3.Angle`이 안에서 `Acos(Clamp(dot, -1, 1))`을 한다

```cpp
const float DotResult = FMath::Clamp(FVector::DotProduct(ForwardVector, ToTarget), -1.f, 1.f);
const float Radian = FMath::Acos(DotResult);           // 라디안
const float Angle = FMath::RadiansToDegrees(Radian);   // 도
```

## 이번 프레임 각도: 작은 쪽

60fps, 최대 회전 180°/s → 한 프레임 최대 약 2.9°

| 남은 각도 | `Min(남은, 2.9)` | `남은 × 2.9` (오늘 버그) |
|---|---|---|
| 60° | 2.9° | 174° 한 프레임에 |
| 10° | 2.9° | 29° (19° 지나침) |
| 1° | 1° 딱 멈춤 | 2.9° (지나침) |

- `Min`이 없으면 목표 근처에서 좌우로 떨린다
- 그래서 `TargetChaseRotateSpeedDeg`는 **초당 최대 회전**. 작으면 피할 수 있는 미사일, 크면 못 피하는 미사일

### dt는 "초당 값"에만

| 값 | 단위 | dt |
|---|---|---|
| 최대 회전 속도 | 도/초 | 곱함 → 도 |
| 남은 각도 `Angle` | 도 | 안 곱함 |
| `Min` 결과 | 도 | 안 곱함 |

- `Angle × (최대 × dt)` = 도² → 단위가 각도가 아니라서 틀린 식

## 오늘 짠 코드, 여섯 단계

| 단계 | 코드 | 연산 |
|---|---|---|
| ① 타겟 방향 | `Target->GetActorLocation() - GetActorLocation()` → `Normalize()` | 도착 − 출발 → 길이 1 |
| ② 축 | `FVector::CrossProduct(ForwardVector, ToTarget).GetSafeNormal()` | 외적 → 길이 1 |
| ③ 남은 각도 | `Clamp` → `Acos` → `RadiansToDegrees` | 내적 → 각도 |
| ④ 이번 각도 | `FMath::Min(Angle, TargetChaseRotateSpeedDeg * DeltaTime)` | 작은 쪽 |
| ⑤ 돌리기 | `AddActorWorldRotation(FQuat(Rotate, FMath::DegreesToRadians(RotateSpeed)))` | 회전 (라디안) |
| ⑥ 이동 | `GetActorForwardVector() * CurrentSpeed` → `AddActorWorldOffset(Velocity * DeltaTime)` | 돌고 난 앞 방향으로 |

- ⑥에서 앞 방향을 **다시** 부른다. ①에서 구한 건 돌기 전 방향

## 종이 코드에서 이미 본 것

| 미사일 | [PaperAero 지도](../projectf/paper-aero-map.html) |
|---|---|
| `CrossProduct(ForwardVector, ToTarget)` | ③ 바닥 `cross(N, flatN)` |
| `AddActorWorldRotation(FQuat(축, 각도))` | ④ 돌리기 |
| `CurrentSpeed += Acceleration * DeltaTime` | `PaperSim`의 `OutVel.z -= Gravity * DeltaTime` |

## 참고 — 이런 함수도 있다

> 오늘 직접 쓰지는 않았지만 같은 일을 해 주는 함수들

| 언리얼 | 유니티 | 하는 일 |
|---|---|---|
| `FMath::FInterpConstantTo(Current, Target, DeltaTime, InterpSpeed)` | `Mathf.MoveTowards` | 숫자 하나를 초당 일정 속도로 목표까지, 지나치지 않게 |
| — | `Quaternion.RotateTowards`, `Vector3.RotateTowards` | 회전을 초당 최대 각도로 목표 쪽으로 |

## 함정

- **빼기 순서**: 도착 − 출발. `나 − 타겟`이면 도망감
- **외적 순서**: 바꾸면 축이 반대 → 고개를 돌림
- **Acos NaN**: Clamp 후 넣기
- **축 길이**: `FQuat` 전에 `.GetSafeNormal()`
- **라디안**: `Acos`는 라디안을 주고 `FQuat`은 라디안을 받는다. 바꿀 건 도로 적은 회전 속도 쪽
- **정반대 타겟**: 외적이 (0,0,0)이라 축이 없음 → 안 돌 수 있다
- **dt**: 초당 값에만

## 더 보기

- [레이더 원뿔 판정](radar-cone.md)
- [내적은 그림자 길이다](dot-product.md)
- [벡터 더하기·빼기·곱하기](vector-ops.md)
- [PaperAero 한 장 지도](../projectf/paper-aero-map.html)
- [2026-10-27 개발 일지](../gamemathlab/devlog/2026-10-27-GameMathLab.md)
