# 발에 반응하는 종이

> ProjectF · 4-1a · 2026-10-30 — 직접 만져 보는 그림은 [paper-influence.html](paper-influence.html)

**발 구 안에 있고 발이 움직이면, 종이 속도를 `발 방향 × PushStrength + 위쪽 × 발 빠르기 × LiftStrength`로 바꾼다. 서 있는 발은 빠르기가 0이라 아무것도 안 한다.** 뒤집히는 건 새 코드가 아니라 3단계 PaperAero의 torque가 한다.

## 전체 흐름

```
UPaperToucherComponent (C++, 캐릭터마다)   발 위치 GetSocketLocation("foot_l"), 발 속도 (지금 − 이전) / DeltaTime
        ▼ 읽어 감
BP_PaperField (BP, 종이 쪽)               매 Tick, 플레이어의 Toucher 값을 Set Niagara Variable
        ▼
USER FootPos / FootVel                    스택에서 PaperInfluence의 INPUT에 Link
        ▼
PaperInfluence (Particle Update 맨 위)     닿았나 → 얼마나 → 어디로. 속도만 바꿈
        ▼
PaperAero → PaperSim (3단계 그대로)        떠오른 종이를 뒤집고, 떨어뜨리고, 눕힘
```

| 왜 이렇게 나눴나 | 출처 |
|---|---|
| 캐릭터 3명(같은 클래스) → 발 계산은 Actor Component. 재사용 부품은 C++, 연결은 BP | Epic 공식 권장 |
| **종이가 몸을 감지**. 캐릭터는 종이를 모름 (10-24 바닥 판단과 같은 방향) | 취향 · 바꿔도 됨 |
| 모듈은 INPUT으로 받고 스택에서 User에 Link → 4-1b에서 6번 쌓고 Link만 다르게 | 취향 · 바꿔도 됨 |
| 새 모듈은 맨 위 → 바꾼 속도를 PaperAero·PaperSim이 같은 프레임에 처리 | 취향 · 바꿔도 됨 |

## 구는 바닥에 얼마나 닿나

- 발목 뼈 `foot_l`은 바닥에서 약 8.7cm 위 (PIE의 FootPos Z)
- 판정은 종이 **가운데 점**으로 → 바닥 높이에서 구가 덮는 폭 안에 가운데가 들어온 종이만
- 반폭 = √(반지름² − 높이²) (피타고라스)

| FootRadius | 바닥에서 닿는 폭 |
|---|---|
| 15 | 약 24cm (반폭 12) — "대부분 반응 안 함" |
| 20 | 약 36cm (반폭 18) — 지금 |
| 8.7 이하 | 0 — 바닥 종이는 영영 안 걸림 |

## 차인 종이는 어디로 가나

발 빠르기 300일 때 (Push 0.5, Lift 0.6)

```
앞으로 = 300 × 0.5 = 150
위로   = 300 × 0.6 = 180      → kick = (150, 0, 180), 약 50° 위로
```

- 앞과 위는 **나눠 갖는 게 아니라 각자** 정함. 각도는 Lift ÷ Push, 세기는 두 값의 크기
- Push 0.5, Lift 0.5면 250 : 250 → 45° (발 500일 때)
- 대략 높이 = 위쪽 속도² ÷ (2 × 980). 180이면 약 16cm. 실제로는 3단계 `NormalDrag`가 판에 수직인 속도를 깎아서 더 낮게 뜸
- 발 빠르기 0이면 전부 0 → 서 있으면 반응 없음

## 코드: 세 덩어리

```hlsl
// ① 닿았나?
float dist = length(FootPos - Pos);
float inside = step(dist, FootRadius);

// ② 얼마나 반응하나? (서 있으면 0)
float footSpeed = length(FootVel);
float moving = clamp(footSpeed / WakeSpeed, 0.0f, 1.0f);
float w = inside * moving;

// ③ 어디로 보내나?
float3 kick = FootVel * PushStrength + float3(0.0f, 0.0f, 1.0f) * footSpeed * LiftStrength;
OutVel = lerp(Vel, kick, w);
Touched = w;
```

| 줄 | 연산 | 왜 |
|---|---|---|
| `length(FootPos - Pos)` | 떼어내기 → 길이 | 종이에서 발까지 거리 (미사일 `FVector::Dist`) |
| `step(dist, FootRadius)` | 0/1 | 구 안이면 1. CPU VM은 `if` 안 벡터 대입이 안 돼서 숫자로 |
| `clamp(footSpeed / WakeSpeed, 0, 1)` | 비율 | 서 있으면 0, WakeSpeed 이상이면 1 |
| `FootVel * PushStrength` | 늘이고 줄이기 | 발 방향으로 |
| `(0,0,1) * footSpeed * LiftStrength` | 방향(길이 1) × 숫자 | 위쪽. `footSpeed`가 없으면 늘 0.6cm/s라 안 뜸. 3단계 `vn = dot(Vel, N) * N`과 같은 모양 |
| `lerp(Vel, kick, w)` | 섞기 | w = 0 그대로, 1 kick으로 **바꿈**. 더하면 여러 프레임 동안 쌓여 폭발 |
| `Touched = w` | | 확인용(Attribute Spreadsheet). 아무 모듈도 안 읽음 |

### 손 계산 (FootRadius 20, WakeSpeed 100, Push 0.5, Lift 0.6)

| 상황 | ① | ② | ③ 결과 |
|---|---|---|---|
| 종이 (100,0,0), 발 (110,0,9), 발 속도 (300,0,0) | 거리 √181 ≈ 13.5 → inside 1 | 300 ÷ 100 = 3 → 1 → w 1 | (150, 0, 180)으로 튐 |
| 같은 자리, **서 있는 발** | inside 1 | 빠르기 0 → w 0 | 그대로 |
| 거리 50인 종이 | inside 0 | w 0 | 그대로 |
| 천천히 걷는 발 (빠르기 50) | inside 1 | 0.5 → w 0.5 | 원래 속도와 kick의 중간 |

## HLSL이 낯설면: 같은 계산을 C++로

```cpp
FVector PaperInfluence(const FVector& Pos, const FVector& Vel, const FVector& FootPos, const FVector& FootVel,
                       float FootRadius, float PushStrength, float LiftStrength, float WakeSpeed, float& OutTouched)
{
	if (FVector::Dist(FootPos, Pos) > FootRadius)    // ① 구 밖이면 그대로
	{
		OutTouched = 0.f;
		return Vel;
	}
	float FootSpeed = FootVel.Size();                  // ②
	float W = FMath::Clamp(FootSpeed / WakeSpeed, 0.f, 1.f);
	FVector Kick = FootVel * PushStrength + FVector::UpVector * FootSpeed * LiftStrength;   // ③
	OutTouched = W;
	return FMath::Lerp(Vel, Kick, W);
}
// Niagara가 해 주는 것: for (종이 150장) { 위 함수 }
```

| HLSL | UE C++ | Unity C# |
|---|---|---|
| `float3` | `FVector` | `Vector3` |
| `length(a - b)` | `FVector::Dist(a, b)` | `Vector3.Distance` |
| `length(v)` | `v.Size()` | `v.magnitude` |
| `clamp(x, 0, 1)` | `FMath::Clamp` | `Mathf.Clamp01` |
| `lerp(a, b, t)` | `FMath::Lerp` | `Vector3.Lerp` |
| `step` + 곱하기 | `if` | `if` |
| PARTICLES | 반복문 안 `Paper.` 값 | 오브젝트마다 필드 |
| INPUT / USER | 반복문 바깥에서 모두에게 같은 값 | 매니저가 넘기는 값 |

## 값과 디버깅 기록

| INPUT | 값 | 메모 |
|---|---|---|
| `FootPos (Position)`, `FootVel (Vector)` | User에 Link | 위치만 Position, 속도는 Vector |
| `FootRadius (float)` | 20 | 15에서 바닥 폭 12cm가 원인 → 20으로 18cm |
| `PushStrength (float)` | 0.5 | 처음 이름 KickStrength |
| `LiftStrength (float)` | 0.6 | 처음 이름 LiftRatio — 1보다 커도 되는데 "비율"처럼 읽혀서 짝 맞춰 개명 |
| `WakeSpeed (float)` | 100 | 0이면 0으로 나누기 |

- "대부분 반응 안 함" 가설: ① 구가 작다 ② 디딘 발은 멈춰 있고 빠른 발은 공중 ③ NormalDrag가 위쪽 속도를 깎음 → **①부터 하나씩** 바꿔 ①로 확인
- 떠오른 종이가 뒤집히는 건 3단계 torque — 10-29에 예측한 그대로
- Details 값이 PIE 중 안 바뀌어 보인 건 화면 갱신 문제 → [언리얼 함정 모음](../unreal/pitfalls.md)

## 더 보기

- [PaperAero 한 장 지도](paper-aero-map.html)
- [꼬챙이로 보는 torque](../game-math/torque-skewer.md)
- [거리 · 속력 · 시간](../game-math/distance-speed-time.md)
- [2026-10-30 개발 일지](devlog/2026-10-30-ProjectF.md)
