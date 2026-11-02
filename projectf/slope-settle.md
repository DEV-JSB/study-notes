# 경사면에 눕기 — faceSign은 "덜 도는 쪽 고르기"

> ProjectF · PaperAero settle · 2026-11-02 — 직접 움직여 보는 그림은 [slope-settle.html](slope-settle.html)

**작업자 문장: "종이 법선과 바닥 법선을 외적해서 돌릴 축을 정하고, faceSign으로 어느 쪽으로 돌릴지 정한다."**
faceSign은 앞면·뒷면 중 **덜 도는 쪽**을 고른다. 경사면 대응은 목표 축을 월드 위 (0,0,1)에서 바닥 법선 `FloorN`으로 바꾼 것뿐이다.

## 코드

```hlsl
float  faceSign = step(0.0f, dot(N, FloorN)) * 2.0f - 1.0f;
float3 flatN    = FloorN * faceSign;
float3 settle   = cross(N, flatN) * SettleSpeed;
```

전에는 `flatN = float3(0, 0, step(0, N.z) * 2 − 1)` 이었다. `N.z`는 `dot(N, (0,0,1))`이니, **(0,0,1) 자리를 FloorN으로 바꾼 것**이 전부. 평평한 바닥(FloorN = (0,0,1))에서는 예전과 똑같다.

## faceSign — 숫자로

| 종이 상태 | dot(N, FloorN) | faceSign | 목표 | 돌 각도 |
|---|---|---|---|---|
| 앞면이 위, 20° 기울어 착지 | +0.94 | +1 | 바닥 법선 | 20° |
| 뒷면이 위, 160° 기울어 착지 | −0.94 | −1 | 바닥 법선 반대 | 20° |
| 위 경우에 faceSign이 없다면 | | | 바닥 법선 | **160° (바닥에서 공중제비)** |

- `dot` 부호 = 앞이냐 뒤냐 (그림자 방향) → [꼬챙이로 보는 torque](../game-math/torque-skewer.md)의 "꼬챙이를 앞으로 꽂을지 뒤로 꽂을지는 내적의 부호"와 **같은 것**
- `step(…) × 2 − 1` = 0/1을 −1/+1로. 휨 노트의 `(u − 0.5) × 2`와 같은 모양
- `cross(N, FloorN × s) = s × cross(N, FloorN)` → "외적으로 축, faceSign으로 방향"이라는 작업자 설명과 코드가 같은 뜻

## 얼마나 돌리나

| N과 목표 사이 | cross 길이 | 빠르기 (× SettleSpeed 8) |
|---|---|---|
| 90° | 1.0 | 8 |
| 30° | 0.5 | 4 |
| 10° | 0.17 | 1.4 |
| 0° | 0 | 0 — 저절로 멈춤 |

- 외적 길이 = sin(각도) ([내적은 숫자, 외적은 화살표](../game-math/dot-cross.md)). "벌어질수록 길고, 평행하면 0"
- 정확히 180°도 평행이라 0 → 안 돈다 (TiltDeg 실험에서 180°를 피한 이유)
- 이번 프레임에 실제로 도는 양 = 속도 × DeltaTime (쿼터니언 누적 줄)

## FloorN은 어디서

| 값 | 쓰는 곳 | 읽는 곳 |
|---|---|---|
| `PARTICLES FloorN (Vector)` | Particle Spawn Set: (0,0,1) / **PaperSim**: 트레이스 법선 | **PaperAero** (위에 있어서 한 프레임 늦게 읽음 — Landed와 같은 방식) |

```hlsl
// PaperSim 맨 아래 (FloorNrm = Perform Collision Query Sync CPU의 법선 출력)
float  hitF      = FloorHit ? 1.0f : 0.0f;
float3 fallbackN = float3(0.0f, 0.0f, 1.0f);
OutFloorN = lerp(fallbackN, FloorNrm, hitF);   // 벡터를 ? : 로 고르지 않고 lerp로 (CPU VM 함정 회피)
```

## 한계

- 중심 한 점에서만 바닥을 잰다. **절벽 끝에 절반 걸친 종이**는 중심 아래에 바닥이 있으니 "다 바닥 위"라고 믿고 수평으로 떠 있다 (작업자가 스스로 짚은 한계 → 디테일 후보)
- 착지하면 속도가 0이라 경사면에서 미끄러지진 않는다 (종이라 이게 맞음)
- 우리 종이는 앞뒷면이 같은 색이라 faceSign의 효과가 화면에 거의 안 보인다 (망가뜨려 보기 실험이 실패한 이유)
