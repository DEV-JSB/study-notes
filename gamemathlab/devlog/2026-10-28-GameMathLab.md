# 2026-10-28 개발 일지

> GameMathLab (UE 5.4, C++) · 게임 수학 상설 연습장 · 과정 1(내적·외적·회전) 마무리 — 외적 순서 실험, 내적=cos·외적=sin, 터렛이 유도 미사일 발사·근접 파괴·1초 쿨타임

## 오늘 한 것

- **외적 순서 바꾸기 실험** — `CrossProduct(ToTarget, ForwardVector)`로 바꾸니 미사일이 "딱 반대로" 도망감. 정반대가 되자 더 돌지 않고 직선으로 멀어짐. 확인 후 원래 순서로 되돌림
- **내적·외적 개념 다지기** — 정반대면 외적이 0인 이유, 내적 = cos / 외적 길이 = sin, 왜 내적은 숫자고 외적은 화살표인지, 외적 길이로는 30°와 150°를 구별 못 하는 이유
- **터렛이 미사일을 쏨** — `CreateMissile(AActor* TargetActor)`: `SpawnActor`로 수직(`FRotator(90, 0, 0)`) 발사 → 돌려받은 미사일을 확인하고 `SetTargetActor`로 타겟 넘김
- **미사일 쪽 입구** — `TestTarget` → `TargetActor`(약한 포인터)로 이름을 바꾸고 `SetTargetActor` 함수 추가
- **처음엔 매 프레임 한 발씩 쏟아짐** — "이상한 게 만들어졌다". 원인은 한 번 쏜 타겟을 안 빼서. 이것대로 나쁘지 않다고 판단
- **가까워지면 미사일 스스로 파괴** — `FVector::Dist(...) <= HitDistance`면 `Destroy` 후 `return`
- **1초 쿨타임** — 마지막 발사 시각을 `GetWorld()->GetTimeSeconds()`로 기억하고, 지난 시간이 `MissileReloadTime`보다 작으면 안 쏨
- **과정 1 마무리** — 내일부터 파레이돌리아 모작(ProjectF)으로 복귀

## 최종 코드

### `Turret.h` (추가한 부분)

```cpp
public:
	UPROPERTY(EditAnywhere, Category = "Turret")
	float MissileReloadTime = 1.f;

private:
	float LastMissileLaunchedTime = 0.0f;

private:
	void CreateMissile(AActor* TargetActor);
```

### `Turret.cpp`

```cpp
#include "Missile.h"

void ATurret::CreateMissile(AActor* TargetActor)
{
	if (GetWorld()->GetTimeSeconds() - LastMissileLaunchedTime < MissileReloadTime)
	{
		return;
	}

	AMissile* Missile = GetWorld()->SpawnActor<AMissile>(MissileClass, GetActorLocation(), FRotator(90.f, 0.f, 0.f));
	if (IsValid(Missile))
	{
		Missile->SetTargetActor(TargetActor);
		LastMissileLaunchedTime = GetWorld()->GetTimeSeconds();
	}
}

// Tick — 원뿔 안이면
			CreateMissile(actor);
```

### `Missile.h` (바뀐 부분)

```cpp
public:
	AMissile();
	void SetTargetActor(AActor* Actor);

public:
	UPROPERTY(VisibleAnywhere, Category = "Missile")
	TWeakObjectPtr<AActor> TargetActor;
	UPROPERTY(EditAnywhere, Category = "Missile")
	float HitDistance = 5.f;
```

### `Missile.cpp` (바뀐 부분)

```cpp
void AMissile::SetTargetActor(AActor* Actor)
{
	TargetActor = Actor;
}

// Tick의 else (유도) 맨 앞
		AActor* Target = TargetActor.Get();
		if (!IsValid(Target))
		{
			return;
		}

		if (FVector::Dist(Target->GetActorLocation(), GetActorLocation()) <= HitDistance)
		{
			Destroy(true);
			return;
		}

// 남은 각도 확인용 화면 로그
		if (GEngine)
		{
			GEngine->AddOnScreenDebugMessage(3, 0.5f, FColor::Green, FString::Printf(TEXT("Angle = %.1f"), Angle));
		}
```

### 줄별

| 줄 | 하는 일 | 연산 |
|---|---|---|
| `GetTimeSeconds() - LastMissileLaunchedTime` | 마지막으로 쏜 뒤 지난 시간 | 떼어내기 (지금 − 그때) |
| `< MissileReloadTime` → `return` | 아직 1초가 안 지났으면 안 쏨 | 비교 |
| `SpawnActor<AMissile>(MissileClass, 위치, 회전)` | 설계도(`TSubclassOf`)로 미사일을 찍어 내고 그 주소를 돌려받음. 유니티 `Instantiate` | |
| `FRotator(90.f, 0.f, 0.f)` | **(Pitch, Yaw, Roll)** 순서. Pitch +90 = 위를 봄 → 수직 발사 | 회전 |
| `IsValid(Missile)` | 클래스가 비었거나 스폰이 실패하면 `nullptr` → 크래시 방지 | |
| `SetTargetActor(TargetActor)` | 매개변수 `AActor*`(잠깐)를 미사일의 약한 포인터 멤버(오래)에 저장 | |
| `LastMissileLaunchedTime = …` | 스폰에 **성공했을 때만** 시각 갱신 | |
| `FVector::Dist(A, B)` | 두 점 사이 거리 = (A − B)의 길이 | 떼어내기 → 길이 |
| `Destroy(true); return;` | 미사일 제거. 아래 회전·이동은 실행하지 않음 | |

## 티키타카 — 질문하고 배운 것

### Q. 로그랑 외적 순서 바꾸기가 뭔 소리야? 지금 코드가 외적 써서 추적하는 거 아냐?

- 맞다. 새 기능이 아니라 지금 코드를 **잠깐 건드려서 확인만 하는 실험**. 끝나면 되돌린다
- 로그 = 눈으로 본 걸 숫자로 확인 (`Angle`이 0으로 가나)
- 순서 바꾸기 = 일부러 망가뜨려 보기. 외적은 순서를 바꾸면 축이 정반대 → 미사일이 도망가야 함
- 결과: "역으로 막 가네, 딱 반대로 가는 느낌" → 축만 뒤집히고 얼마나 돌지(내적, `Min`)는 그대로라서 같은 빠르기로 반대쪽으로 돈 것

### Q. 직선으로 멀어지긴 했는데, 왜 정반대면 외적이 (0,0,0)이야?

- 외적의 길이 = |A| × |B| × **sin(사이 각도)**. sin 0° = sin 180° = 0
  - 0° → 0, 30° → 0.5, 90° → 1, 150° → 0.5, 180° → 0
  - 손 계산: `CrossProduct((1,0,0), (−1,0,0)) = (0, 0, 0)`
- 뜻으로: 바로 뒤를 보려면 왼쪽으로 180°, 오른쪽으로 180°, 위로 젖혀서… **정답 축이 무수히 많아서** 하나로 못 고름 → 0
- 그래서 도망가던 미사일이 타겟을 정확히 등지자 축이 없어서 안 돌고 직진. 원래 순서에서도 타겟이 정확히 뒤면 같은 일 → 실제 게임은 "아무 축이나 하나 골라 돌기"로 처리

### Q. 내적은 cos를 한 값이고 외적은 sin을 한 값이었어?

| | 결과 | 길이 1끼리일 때 | 알려 주는 것 |
|---|---|---|---|
| 내적 | **숫자** | cos(사이 각도) | 사이 각도 |
| 외적 | **화살표** | 방향 = 돌릴 축, **길이 = sin(사이 각도)** | 어느 쪽으로 + 각도 힌트 |

- 둘 다 안에서 cos·sin을 부르지 않는다. 곱하고 더하고 빼기만 하는데 결과가 수학적으로 cos·sin과 같아짐
- 검증: 길이 1끼리면 언제나 **내적² + 외적 길이² = 1** (cos² + sin² = 1)

### Q. sin이 감이 잘 안 잡히네

- 길이 1인 화살표 = **그림자 조각**(앞 방향 위, cos = 내적) + **옆 조각**(그림자에서 비켜 난 길이, sin)
- sin = "얼마나 옆으로 비켜 있나". 정면(0°)·정반대(180°)는 일직선이라 옆 조각이 없어서 0
- **이미 짠 코드에 있다**: 종이 ② 공기저항의 `vt = Vel - vn` (그림자를 떼어낸 나머지)이 바로 옆 조각
- cos² + sin² = 1은 빗변 1인 직각삼각형의 피타고라스 (중2)

### Q. 왜 내적은 cos 값이고 외적은 벡터로 나와?

- 질문이 다르다
  - 내적: "앞으로 얼마나?" → 앞은 하나뿐 → 숫자
  - 외적: "옆으로 얼마나, **어느 옆**?" → 3D에서 앞에 수직인 "옆"은 한 바퀴 빙 둘러 **무수히 많음** → 방향을 담은 화살표
- 증거: **2D에서는 외적도 숫자 하나** (`A.X × B.Y − A.Y × B.X`). 평면에서 옆은 왼쪽·오른쪽 둘뿐이라 부호로 충분. 유도 노트 실험의 "외적 Z" 칸이 이것

### Q. 외적으로 어떻게 방향을 구할 수 있는 건지… 너무 깊게 들어가는 걸까?

- 지금은 몰라도 됨 (PaperAero 지도에서도 외적 공식 안쪽은 블랙박스 OK)
- 한 칸만 더: **3D 외적 = 2D 외적 세 개**. 바닥(XY) → 축.Z, 옆벽(YZ) → 축.X, 앞벽(ZX) → 축.Y
  - 앞 (1,0,0), 목표 오른쪽 위 앞 (0.7, 0.5, 0.5) → 축 (0, −0.5, 0.5): 옆으로도 돌고 고개도 들어야 하는 **기울어진 축**
- 연습 2(맞은 방향)를 하면 축.Z 한 줄(2D 외적)을 직접 쓰게 됨

### 내가 정리한 문장 ①

> "2D 에서는 외적도 마찬가지로 그냥 숫자에 불과하지만, 3D 에서는 그런 단순 숫자를 가지고는 방향을 알 수가 없기 때문에 입체적으로 여러 평면들끼리의 외적을 합친 값을 구한다?"

- **맞음.** 한 단어만: "합친"은 더하는 게 아니라 축의 X·Y·Z 칸에 **하나씩 넣어 모은** 것

### 내가 정리한 문장 ②

> "내적은 어디로 회전해야 하는 게 아닌, 회전해야 하는 양밖에 필요하지 않으니까 굳이 3차원까지 갈 필요가 없다?"

- **반만 맞음.** 내적도 세 칸을 전부 쓴다 (`A.X×B.X + A.Y×B.Y + A.Z×B.Z`). 레이더 원뿔에서 높이까지 판정된 것도 그래서
- 고친 문장: 내적도 3차원을 다 쓰지만, **"얼마나"는 숫자 하나로 대답할 수 있어서** 결과가 숫자다

### Q. "앞으로 얼마나, 옆으로 얼마나"는 좀 헷갈리지 않나? 그럼 외적으로도 cos처럼 얼마나 돌지 알 수 있다는 건가

- Claude 표현이 헷갈렸음 → 고침
- 외적 길이(sin)로도 각도를 **반쯤** 알 수 있지만 **30°와 150°가 둘 다 0.5**라서 "조금만 돌면 되나, 거의 뒤돌아야 하나"를 구별 못 함
- 내적(cos)은 0°~180°에서 값이 전부 다름 (1 → −1로 계속 줄어듦) → `Acos(내적)` 하나로 각도가 딱 정해짐
- 그래서 역할 분담: **얼마나 = 내적**, **어느 쪽 = 외적의 방향**, 외적 길이는 `GetSafeNormal()`로 버림
- 둘을 같이 쓰면 더 정확: `Atan2(외적 길이, 내적)` — 지금 코드(`Acos` + `Clamp`)도 충분
- 그림: [내적은 숫자, 외적은 화살표](../../game-math/dot-cross.md) — 30°와 150°가 거울처럼 대칭인 그림

### Q. 생성 부분 — 타겟은 TWeakObjectPtr로 넘겨야 할까? AActor*로?

- **자리가 다르다**: 함수 매개변수(잠깐) = `AActor*`, 미사일이 몇 초 동안 기억하는 칸 = `TWeakObjectPtr` (그저께 정리한 규칙 그대로)
- 받아서 멤버에 저장하는 순간 약한 포인터로 바뀜. 대입하면 알아서 받아 줌
- 미사일에 입구 함수(`SetTargetActor`)를 두면 나중에 "타겟이 바뀌면 단계 초기화" 같은 걸 넣기 쉬움 (커뮤니티 표준)
- 유니티 `Instantiate` = 언리얼 `SpawnActor`. 그저께 만든 `MissileClass`(`TSubclassOf`)가 드디어 "프리팹 자리"로 쓰임
- 처음엔 `SpawnActor`의 결과를 안 받아서 타겟이 안 넘어갔고, 회전도 `GetActorRotation()`(터렛의 수평 방향)이었음 → 고침

### Q. 언리얼은 FRotator가 Yaw Pitch Roll이 아니라 Pitch Yaw Roll이구나. 근데 축이 다르지 않아?

- `FRotator(Pitch, Yaw, Roll)` (Epic 공식). 유니티 `Quaternion.Euler(x, y, z)`도 사실 (Pitch, Yaw, Roll) 순서
- 이름은 **물체 기준 동작**이라 두 엔진에서 뜻이 같고, 붙는 축 글자만 다름 (Yaw = 위 축: UE Z / Unity Y)
- 헷갈리는 곳: 언리얼 **Details는 X(Roll) Y(Pitch) Z(Yaw)**, 코드는 Pitch-Yaw-Roll
- 부호: 언리얼 Pitch +90 = 위를 봄, 유니티 x +90 = 아래를 봄
- 그림: [회전 Pitch·Yaw·Roll](../../game-math/rotation-pyr.md)

### Q. 이렇게 해야 안전한 건가? (`IsValid(Missile)`)

- 맞다. `MissileClass`가 비었거나 스폰이 실패하면 `nullptr` → 그냥 넘어감
- `GetWorld()`는 레벨에서 Tick이 도는 액터면 늘 유효 (커뮤니티 표준), `TargetActor`는 부르기 직전 이미 확인
- 덧붙이면 좋은 것: 실패 쪽에 로그 한 줄 ("조용히 안 불린다" 함정 방지)

### Q. 가까워지면 스스로 파괴하고 싶은데, 유니티 SetActive(false) 같은 거?

- 유니티 `Destroy(gameObject)` = 언리얼 `Destroy()`. `SetActive(false)`는 풀링(꺼 두었다 다시 쓰기)용인데, 지금은 매번 새로 만드니 `Destroy`가 짝
- 풀링은 수백 발이 나가 성능이 문제될 때 (커뮤니티 표준)

### Q. 벡터 사이 거리는? 빼고 뭐 하면 됐는데

| 하는 일 | 유니티 | 언리얼 |
|---|---|---|
| 두 점 사이 거리 | `Vector3.Distance(a, b)` | `FVector::Dist(A, B)` |
| 벡터 길이 | `v.magnitude` | `V.Size()` |
| 길이의 제곱 | `v.sqrMagnitude` | `V.SizeSquared()` |

- 정규화는 길이를 1로 **바꾸는** 것, 거리는 그 길이를 **재는** 것. `Normalize()` 직전의 `ToTarget`에 거리가 들어 있음
- 길이 = √(X² + Y² + Z²) — 피타고라스를 3D로 (레이더의 탐지 구와 같은 계산)

### Q. 액터를 "끈다"는 표현이 맞나? 유니티처럼 꺼지면 Tick도 안 도나?

- **아니다.** `SetActorHiddenInGame(true)`는 화면에서만 숨기고 **Tick도 충돌도 그대로**
- 언리얼에는 `SetActive` 같은 스위치 하나가 없고 따로따로: 숨기기(`SetActorHiddenInGame`), Tick(`SetActorTickEnabled`), 충돌(`SetActorEnableCollision`), 전부 없애기(`Destroy`)
- 숨기기만 했을 때 투명한 미사일이 계속 타겟 주위를 돌며 쌓임 → `Destroy` + `return`으로 바꿈

### Q. 미사일 쏘는 데 딜레이를 주려는데, GEngine으로 시간을 받아오면 되나?

- **월드에서** 받는다: `GetWorld()->GetTimeSeconds()` (게임 시작 후 지난 시간, 일시정지 영향 받음) = 유니티 `Time.time`
- `GEngine`은 엔진 전체 전역 객체라 지금 게임의 시간은 레벨(월드)이 들고 있음
- 방법 셋: (가) 시간을 직접 쌓기(`+= DeltaTime`) (나) 마지막 발사 시각 기억 (다) 타이머 → (나)를 고름

### Q. GetWorld 같은 건 캐싱해 두는 게 더 빨라?

- 차이 거의 없음. `GetWorld()`는 **검색**이 아니라 이미 있는 연결을 **따라가는** 함수 (커뮤니티 표준)
- 유니티에서 캐싱하던 건 `GetComponent`, `GameObject.Find`처럼 **검색**하는 함수. 언리얼에서도 `FindComponentByClass` 같은 검색은 캐싱
- 월드는 레벨이 바뀌면 달라져서 멤버에 들고 있으면 오히려 위험. 함수 안 지역 변수로 받는 건 OK (읽기 좋게)

## 🚨 오늘 걸린 함정 (습관 경보)

- **`SpawnActor` 결과를 안 받음** — 만들기만 하고 버려서 타겟이 안 넘어감. 유니티의 `var m = Instantiate(...)`처럼 받아서 쓴다
- **`SpawnActor` 결과를 확인 없이 `->`** — 실패하면 크래시. `IsValid`로 확인 (약한 포인터 `.Get()` 때와 같은 습관)
- **쿨타임에서 두 방법이 섞임** — 방법 (나)를 골랐는데 `Tick`에 `MissileReloadTime += DeltaTime;`이 남아 **Details 설정값이 매 프레임 커짐**. Details에서 정한 값은 Tick에서 바꾸지 않는다
- **쿨타임 부등호 반대** — "1초가 지났으면 return"이 되어 있었음. 손 계산(desk check)으로 둘 다 찾음: 방금 쏨(0.016) → return해야 함 / 오래전에 쏨(5) → 쏴야 함
- **`SetActorHiddenInGame`을 유니티 `SetActive(false)`로 생각** — Tick이 계속 돎
- **`Destroy(true)`** — 첫 인자는 멀티플레이용 `bNetForce`. 싱글플레이에선 차이 없지만 의도가 아니면 `Destroy()`
- **Claude 실수**
  - "외적 순서 바꾸기"를 실험이라고 설명하지 않고 할 일 목록에만 적어서, 지금 코드와 무슨 상관인지 헷갈리게 함
  - `HitDistance`에 `UPROPERTY`가 없다고 잘못 지적 → 이름으로 검색한 한 줄만 보고 윗줄의 `UPROPERTY`를 못 봄

## 결정한 것

- **함수 매개변수는 `AActor*`, 오래 기억하는 멤버는 `TWeakObjectPtr`** (Epic 공식 관례)
- **미사일 타겟은 입구 함수 `SetTargetActor`로 넣는다** (커뮤니티 표준)
- **수직 발사**: `FRotator(90, 0, 0)` — 터렛의 수평 회전과 상관없이 위로
- **맞으면 `Destroy`** (풀링은 나중에)
- **쿨타임은 "마지막 발사 시각 기억" 방식**, 간격 `MissileReloadTime` 1초 (취향 · 바꿔도 됨)
- **지금 터렛은 원뿔 안에 타겟이 있는 동안 1초마다 계속 쏜다** — 처음 기획(들어올 때 한 발, `DetectedActors`에서 빼기)과 다르지만 이것대로 둠
- **과정 1(내적·외적·회전)은 여기서 멈추고 ProjectF로 복귀.** 연습 2(맞은 방향)·3(경사면)은 안 함

## 막힌 것 / 미해결

- **`HitDistance` = 5는 작을 수 있음** — 한 프레임 이동(약 80cm)보다 작으면 건너뛰어 타겟 주위를 맴돎. 테스트하며 조절하기로
- **쏜 타겟을 `DetectedActors`에서 빼기**는 안 함 (기획 미정)
- **이름 정리 남음** — `Rotate` → `TurnAxis`, `RotateSpeed` → `StepAngleDeg`, `TargetFollowSpeed`(실제로는 가속도), `TargetActor`는 `private`으로, `Tick`의 `actor` 소문자
- **레벨에 놓아 둔 테스트 미사일** — `TestTarget` 값이 이름 변경으로 사라져 단계 후 멈춤. 지울지 정하기

## 다음에 할 것

- **ProjectF**: PaperAero 지도 ③(`torque = dot × cross`, `cross(N, flatN)`)을 다시 읽고 이제 읽히는지 확인 → 4단계 부위별 몸 반응
- GameMathLab에 돌아오면: 연습 2(맞은 방향 — 2D 외적 부호)부터

## 성장 점검

- **배웠다의 기준**
  - 외적 = 어느 쪽: ④ 알아보기에 가까움 — 순서를 바꿨을 때 미사일이 반대로 갈 걸 실험으로 확인하고 "딱 반대로 가는 느낌"이라고 스스로 말함
  - 내적·외적이 숫자·화살표인 이유: ③ 설명하기 ✅ — 문장 ①은 그대로 맞음, 문장 ②는 반만 맞았지만 고친 문장을 이해함
  - sin: 아직 감이 덜 옴 → 종이 `vt`(옆 조각)로 연결. 그림 노트로 다시
  - 쿨타임: ② 바꿔 보기 ✅ — 손 계산으로 버그 둘을 스스로 고침
- **질문 수준**
  - 3단계(가설 확인)가 많았음: "내적은 cos, 외적은 sin이었어?", "2D에선 숫자, 3D에선 여러 평면을 합친 값?", "내적은 양만 필요하니 3D까지 갈 필요가 없다?", "외적으로도 양을 알 수 있다는 건가?"
  - **Claude 표현을 의심함**: "앞으로 얼마나 / 옆으로 얼마나는 헷갈리지 않나" → 표현이 고쳐지고 30°/150° 문제가 드러남. 끌려다니지 않음
  - **Claude 지적을 의심함**: "HitDistance에 UPROPERTY 넣었는데;" → Claude 실수였음
  - 판단: "이것도 나름 나쁘지 않네" (매 프레임 발사), "1초마다 쏘고 싶어서" — 결과를 보고 기획을 스스로 고름
  - 1단계(어떻게?): 거리 함수, 시간 함수, 액터 끄기 — 새 API라 자연스러움. 전부 유니티 대응을 먼저 떠올리고 물음
- **아쉬운 것**: 외적이 "어떻게" 방향을 구하는지까지 파고들다 시간이 걸림. 블랙박스여도 되는 곳은 "몰라도 됨"을 먼저 확인하고 넘어가기

## 습관 체크

- [ ] 새로 만든 것이 연습 폴더에 있다 — 맵 `Content/TurretLevel/` (규약은 `Content/Maps/`)
- [ ] 네이밍 규약을 지켰다 — `CreateMissile`, `SetTargetActor`, `MissileReloadTime`, `LastMissileLaunchedTime`, `HitDistance` OK / `actor` 소문자 남음
- [x] 눈 말고 값으로 확인했다 — 쿨타임은 손 계산으로 확인. `Angle` 화면 로그는 넣었지만 값을 적어 둔 기록은 없음
- [ ] Output Log에 새로 생긴 경고가 없다 — 확인 안 함
