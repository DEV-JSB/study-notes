# 2026-10-27 개발 일지

> GameMathLab (UE 5.4, C++) · 게임 수학 상설 연습장 · 과정 1(내적·외적·회전) — 미사일: 다단 추진 직진, 외적·내적으로 타겟 쪽 회전 (자정 넘어 10-28 새벽까지)

## 오늘 한 것

- **미사일 설계 세 가지를 먼저 적음** (어제 미해결 1번)
  - 들어온 순간 한 발: 쏜 타겟을 따로 기억하거나 `DetectedActors`에서 빼기 → **기획에 따라 다르다**고 판단. 빼는 쪽으로 결정 (아직 구현 전)
  - 미사일이 알아야 할 것: 타겟의 Transform → **타겟 액터 자체**로 고침
  - 비행: 처음 몇 초는 수직 상승, 그다음 유도
- **직진** — 앞 방향 × 속력 × `DeltaTime`만큼 `AddActorWorldOffset`
- **점점 빨라지게** — 속력에도 가속도 × `DeltaTime`을 쌓음
- **다단 추진 (1단·2단·3단 로켓처럼)** — 구조체 `FMissileStage`(Duration, Acceleration)를 `TArray`로 Details에서 세팅, 인덱스로 단계를 넘김
  - 마지막 단계가 끝나면 그때부터 유도 (의도한 구조)
  - 이동 줄을 시간 검사 앞으로 옮겨서 단계가 바뀌는 프레임에 한 프레임 멈칫하던 것도 해결
- **테스트용 타겟** — `TestTarget`을 처음엔 `TSubclassOf<AActor>`로 만들었다가 `TWeakObjectPtr<AActor>`로 고침
- **유도 회전** — 외적으로 어느 쪽(축), 내적으로 얼마나(각도), `Min`으로 지나치지 않게, `FQuat`으로 돌리고, 돌고 난 앞 방향으로 이동
- **Play에서 동작 확인** — 단계 추진 후 타겟 쪽으로 꺾여 날아감

## 최종 코드

### `Missile.h`

```cpp
USTRUCT(BlueprintType)
struct FMissileStage
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, Category = "Missile")
	float Duration = 1.0f;

	UPROPERTY(EditAnywhere, Category = "Missile")
	float Acceleration = 2000.0f;
};

UCLASS()
class GAMEMATHLAB_API AMissile : public AActor
{
	GENERATED_BODY()

public:
	AMissile();

public:
	UPROPERTY(EditAnywhere, Category = "Missile")
	TArray<FMissileStage> FlyStages;
	UPROPERTY(EditAnywhere)
	TWeakObjectPtr<AActor> TestTarget;
	UPROPERTY(EditAnywhere, Category = "Missile")
	float TargetFollowSpeed = 10.0f;
	UPROPERTY(EditAnywhere, Category = "Missile")
	float TargetChaseRotateSpeedDeg = 180.0f;

	float CurrentSpeed = 0.0f;
	float StageElapsedTime = 0.0f;
	int32 FlyStageIndex = 0;

	// ... BeginPlay, Tick (에디터 기본 틀)
};
```

### `Missile.cpp` — `Tick`

```cpp
void AMissile::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	StageElapsedTime += DeltaTime;

	if (FlyStageIndex < FlyStages.Num())
	{
		float StageAcceleration = FlyStages[FlyStageIndex].Acceleration;
		float StageDuration = FlyStages[FlyStageIndex].Duration;

		CurrentSpeed += StageAcceleration * DeltaTime;

		const FVector ForwardVector = GetActorForwardVector();
		const FVector Velocity = ForwardVector * CurrentSpeed;
		AddActorWorldOffset(Velocity * DeltaTime);

		if (StageElapsedTime > StageDuration)
		{
			FlyStageIndex++;
			StageElapsedTime = 0.f;
		}
	}
	else
	{
		AActor* Target = TestTarget.Get();
		if (!IsValid(Target))
		{
			return;
		}

		// 타겟을 향해서 날아가도록
		FVector ToTarget = Target->GetActorLocation() - GetActorLocation();
		ToTarget.Normalize();
		const FVector ForwardVector = GetActorForwardVector();

		// 어느 축으로 돌아야할지를 구한다
		const FVector Rotate = FVector::CrossProduct(ForwardVector, ToTarget).GetSafeNormal();

		// 얼만큼 돌아야할지 구한다
		const float DotResult = FMath::Clamp(FVector::DotProduct(ForwardVector, ToTarget), -1.f, 1.f);
		// DotResult 는 cos 의 값이므로 cos 을 기반으로 라디안을 구해야한다
		const float Radian = FMath::Acos(DotResult);
		const float Angle = FMath::RadiansToDegrees(Radian);

		const float RotateSpeed = FMath::Min(Angle, TargetChaseRotateSpeedDeg * DeltaTime);
		AddActorWorldRotation(FQuat(Rotate, FMath::DegreesToRadians(RotateSpeed)));

		CurrentSpeed += TargetFollowSpeed * DeltaTime;

		const FVector Velocity = GetActorForwardVector() * CurrentSpeed;
		AddActorWorldOffset(Velocity * DeltaTime);
	}
}
```

### 줄별

| 줄 | 하는 일 | 연산 |
|---|---|---|
| `CurrentSpeed += StageAcceleration * DeltaTime` | 이번 프레임에 늘어나는 속력을 지금 속력에 더함. 변수는 계속 **초당 속력(cm/s)** | 이어 붙이기 |
| `ForwardVector * CurrentSpeed` | 앞 방향(길이 1)에 속력을 곱해 속도 벡터 | 늘이고 줄이기 |
| `AddActorWorldOffset(Velocity * DeltaTime)` | 1초치 속도를 이번 프레임치 거리로 줄여서 위치에 더함 | 늘이고 줄이기 → 이어 붙이기 |
| `FlyStages[FlyStageIndex]` | 지금 단계의 설정을 꺼냄. `FlyStageIndex < FlyStages.Num()`으로 범위를 먼저 막음 | |
| `TestTarget.Get()` + `IsValid` | 지켜보던 타겟을 꺼내고, 없으면 이번 프레임은 아무것도 안 함 | |
| `Target - 나` → `Normalize()` | 미사일에서 타겟으로 가는 방향. **도착 빼기 출발** | 떼어내기 → 길이 1로 |
| `CrossProduct(ForwardVector, ToTarget)` | 앞 방향을 타겟 쪽으로 돌릴 **축** (어느 쪽으로) | 외적 |
| `.GetSafeNormal()` | 축의 길이를 1로. 방향만 남김 (얼마나는 각도가 맡음) | 늘이고 줄이기 |
| `Clamp(DotProduct(...), -1, 1)` | 남은 각도의 cos 값. 오차로 1을 살짝 넘으면 `Acos`가 NaN이라 잘라 둠 | 그림자 (내적) |
| `Acos` → `RadiansToDegrees` | cos 값을 각도로 되돌림 (라디안 → 도) | |
| `Min(Angle, TargetChaseRotateSpeedDeg * DeltaTime)` | 남은 각도와 이번 프레임 최대 회전 중 **작은 쪽**. 지나치지 않게 | |
| `AddActorWorldRotation(FQuat(축, 라디안))` | 그 축으로 그 각도만큼 돌림. `FQuat`은 라디안 | 회전 |
| `GetActorForwardVector()` (다시) | **돌고 난** 앞 방향으로 이동 | |

## 티키타카 — 질문하고 배운 것

### Q. 미사일을 전방으로 계속 날리려면 어떤 함수를 써야 해?

- 실마리(앞 방향 함수, `AddActorWorldOffset`, 종이의 `OutPos += OutVel * DeltaTime`)는 다 받았는데 **한 줄로 합치는 데서** 멈춤
- 쪼개기: 이번 프레임 이동 = **앞 방향 × 속력 × 이번 프레임 시간** (어느 쪽 × 얼마나 빨리 × 얼마 동안). 거리 = 속력 × 시간에 방향만 곱한 것
- 다음엔 "무엇 × 무엇 × 무엇"을 한국어로 먼저 적고 함수를 찾기

### Q. 이건 일정한 속력 아냐? 점점 빨라졌으면 좋겠어

- 위치가 속도를 따라 쌓이듯, **속력은 가속도를 따라 쌓인다**. 같은 모양의 줄이 하나 더
- 종이 `PaperSim`의 `OutVel.z = InVel.z - (Gravity * DeltaTime)`이 바로 이것. **중력 = 가속도**
- 고등학교 물리의 등가속도 운동. 가속도는 영어로 acceleration (cm/s²)

### Q. 속력에 DeltaTime을 곱했는데, AddActorWorldOffset에 넘길 때도 곱해야 해?

- **둘 다 곱한다.** 단위로 확인
  - 가속도(cm/s²) × dt(s) = cm/s → 속력에 더할 수 있음
  - 속도(cm/s) × dt(s) = cm → 위치에 더할 수 있음
  - 속도(cm/s)를 그대로 위치에 더하면 단위가 안 맞음
- 단위 맞추기(차원 분석): 더하는 두 값의 단위가 같은지만 보면 dt가 빠졌는지 보인다

### Q. 속력에 dt를 곱했으니 그 속력은 이미 "프레임당" 값 아냐?

- `Acceleration * DeltaTime`은 **이번 프레임에 더해지는 양**이고, `CurrentSpeed` **변수 자체**는 계속 초당 속력
- 60fps, 가속도 600이면 매 프레임 10씩 더해져서 60프레임(1초) 뒤 `CurrentSpeed` = 600. 가속도 뜻 그대로 "1초에 600 늘었다"
- 이게 프레임당 값이었다면 1초에 360m를 가야 해서 말이 안 됨

### Q. 결국 초당 값을 프레임별로 쪼개야 하는 거고, 안 하면 60배로 움직이는 거지?

- **맞다.** 내가 정한 값은 초당이고, 매 프레임 그중 이번 몫(× dt)만 쓴다
- dt를 빼면 1초치를 매 프레임 통째로 → 60fps면 60배, 144fps면 144배. **컴퓨터마다 속도가 달라지는** 게 더 큰 버그

### Q. 유니티에선 struct 묶어서 배열로 직렬화했는데 언리얼은?

| 유니티 | 언리얼 |
|---|---|
| `[System.Serializable] struct Stage` | `USTRUCT() struct FMissileStage` (F 접두사, `GENERATED_BODY()`) |
| 필드에 `[SerializeField]` | 필드마다 `UPROPERTY(EditAnywhere)` |
| `Stage[]` / `List<Stage>` | `TArray<FMissileStage>` |
| `int` | `int32` |

- 구조체는 그걸 쓰는 `UCLASS()`보다 **위에** 선언 (Epic 공식)
- 헤더에 `USTRUCT`/`UPROPERTY`를 추가할 땐 에디터를 끄고 IDE 빌드

### Q. TArray는 IndexOutOfRange 방어를 어떻게 해? Length나 Size가 없네

- 개수는 `Num()` (int32). 범위 확인은 `IsValidIndex(i)` (음수와 끝을 한 번에)
- C#처럼 예외를 잡는 게 아니라 **꺼내기 전에 확인**하는 문화. 범위를 넘으면 에디터에서 어서트로 멈춤 (Epic 공식)

### Q. 초기값을 무조건 넣어야 해?

- `AActor`/`UObject` 멤버는 엔진이 메모리를 0으로 채워서 안 넣어도 0 (Epic 공식). **지역 변수와 일반 구조체는 쓰레기값**일 수 있음 (C++ 규칙)
- 그래도 항상 넣는다: 코드를 옮기면 버그, 의도가 보임, 경고, Details 첫 값

### Q. 외적을 하면 회전해야 하는 양을 알아내는 건가?

- 반만 맞음. 회전 하나 = **축 + 각도** (유니티 `Quaternion.AngleAxis(각도, 축)`처럼)
  - **어느 쪽으로** = 외적 (`CrossProduct`)
  - **얼마나** = 내적 → 각도로 되돌리기 (`Acos`)
- 내가 정리한 문장: **"타겟 쪽을 보려면, 내가 보는 방향과 타겟으로의 방향을 외적해서 어느 쪽으로 돌지 알아내고, 내적으로 얼마나 돌지 구한다"**
- 외적 공식 안쪽(성분 계산)은 지금 몰라도 됨. PaperAero 지도에서도 외적은 "2층 · 말로 설명"
- 외적은 한국 고등학교 교과에 없는 것으로 알고 있음(확실치 않음). 한 칸 아래 기초는 "수직": 외적 결과는 두 방향 모두에 수직

### Q. 정규화는 normalize 아니었나?

| 하는 일 | 유니티 | 언리얼 |
|---|---|---|
| 원본을 길이 1로 바꿈 | `v.Normalize()` | `V.Normalize()` (bool 반환) |
| 길이 1짜리 새 벡터를 돌려줌 | `v.normalized` | `V.GetSafeNormal()` |

### Q. Acos 앞에 Clamp 거는 게 다들 쓰는 표준이야?

- 흔한 관용구 (커뮤니티 표준). 유니티 `Vector3.Angle`이 안에서 하는 일이 정확히 `Acos(Clamp(dot, -1, 1))`
- `FMath::Acos`는 범위를 검사하지 않음 → 1.0000001이 들어가면 NaN → 미사일이 사라짐
- 축 정규화와 함께, **유니티가 몰래 해 주던 걸 언리얼에선 직접** 하는 두 가지

### Q. 축도 길이 1로?

- 외적 결과는 방향은 맞지만 **길이가 제각각** (90°면 1, 30°면 0.5, 1°면 0.017)
- `FQuat(축, 각도)`는 축 길이가 1이라고 믿고 계산 (Epic 공식). 얼마나는 각도가 맡으니 축은 방향만 → **방향을 온전히 쓰려고 정규화**

### Q. 지역 변수에도 const를 많이 붙이던데 좋은 습관이야?

- 좋은 습관 (Epic 코딩 표준의 const 정확성을 지역 변수까지 넓힌 것, 커뮤니티 표준). **한 번 정하고 안 바꾸는 값이면 const**
- 실수로 바꾸면 컴파일러가 막고, 읽는 사람이 덜 추적해도 됨
- `ToTarget`은 다음 줄 `Normalize()`가 원본을 바꿔서 const 불가. `GetSafeNormal()`로 한 줄에 쓰면 가능
- 값 반환형에는 붙이지 않음 (Epic 공식)

### Q. TargetChaseRotateSpeedDeg는 최대 회전 속도 같은 느낌인가?

- 맞다. `Min`을 쓰는 순간 "초당 이 이상은 못 돈다"는 **상한**. 멀리 벗어나 있으면 최대로, 거의 보고 있으면 남은 만큼만
- 이 숫자 하나로 미사일 성격이 정해짐 (작으면 피할 수 있음, 크면 못 피함)
- `UCharacterMovementComponent`의 Rotation Rate가 같은 개념 (Epic 공식)

### Q. Min(Angle, 최대 × dt)에서 Angle 쪽에도 dt를 곱해야 하는 거 아냐?

- **dt는 "초당 값"에만 곱한다.** `Angle`은 지금 남은 각도(도)라 이미 양
- 최대 회전 속도(도/s) × dt = 도. 둘 다 "도"라서 비교 가능
- Angle에도 곱하면 남은 각도가 줄수록 점점 느려지고, 결과에 곱하면 dt를 두 번 곱해 60배 느림
- 판단 기준: 뜻에 **"초당"**이 있으면 dt, **"지금 남은 / 지금 위치"**면 안 곱함

### Q. Min으로 묶는 건 이미 다 돌았는데 더 도는 걸 막으려고?

- 정확히는 **남은 것보다 더 돌지 않게**. 없으면 목표 근처에서 좌우로 떨림
- "남은 양과 이번에 갈 수 있는 양 중 작은 쪽"은 문 열기, 체력 바 채우기, 카메라 옮기기에서도 같은 모양

## 참고 — 이런 함수도 있다

> 오늘 직접 쓰지는 않았지만 "나중에 정리할 때 참고로 적어 달라"고 한 것.

| 언리얼 | 유니티 | 하는 일 |
|---|---|---|
| `FMath::FInterpConstantTo(Current, Target, DeltaTime, InterpSpeed)` | `Mathf.MoveTowards` | 숫자 하나를 초당 일정 속도로 목표까지, 지나치지 않게. 오늘 짠 `Min(남은 양, 최대 × dt)`와 같은 일 |
| — | `Quaternion.RotateTowards`, `Vector3.RotateTowards` | 회전을 초당 최대 각도로 목표 쪽으로. 오늘 짠 유도 회전과 같은 일 |

## 🚨 오늘 걸린 함정 (습관 경보)

- **`launchSpeed` 소문자** — 어제 `actor`, 그 전 `result`·`angle`에 이어 또 C# 습관. 멤버·지역 변수 모두 PascalCase (Epic 공식). 고쳐서 `CurrentSpeed`
- **`int FlyStageIndex`** → `int32` (Epic 공식)
- **이름이 하는 일과 어긋남** — `LaunchDuration`(실제로는 단계에서 지난 시간), `launchSpeed`(실제로는 지금 속력) → `StageElapsedTime`, `CurrentSpeed`로 고침
- **`TSubclassOf`로 레벨에 놓인 타겟을 가리키려 함** — 클래스(설계도)라 위치를 꺼낼 수 없음. 판단 질문: **"새로 만들 건가, 이미 있는 걸 가리킬 건가?"** 새로 찍으면 `TSubclassOf`, 있는 걸 지켜보면 `TWeakObjectPtr`
- **빼기 순서 반대** (`나 − 타겟`) — 미사일이 타겟에서 도망감. **도착 빼기 출발**. 터렛 코드에선 맞게 썼음
- **약한 포인터를 확인 없이 `->`** — 타겟이 없으면 크래시. `Get()` + 확인 후 사용
- **`Acos` 결과(라디안)를 `DegreesToRadians`로 또 변환** — 바꿔야 하는 건 회전 속도(도) 쪽. 이름에 `Rad`/`Deg`를 붙이면 덜 헷갈림
- **이번 프레임 각도를 `Angle * (최대 × dt)`로 곱함** — 단위가 도² → 한 프레임에 174°씩 돌며 휘청. `Min`으로 작은 쪽 고르기
- **회전 전에 구한 앞 방향으로 이동** — 한 프레임 늦은 방향. 회전 뒤 `GetActorForwardVector()`를 다시 부름
- **Claude 실수**
  - dt 설명에서 "조각과 통"이라는 비유를 썼다가 오히려 헷갈리게 함 → 변수 이름과 숫자 표로 다시 설명
  - 가속 중 dt를 빼먹은 경우를 "약 61배"라고 함 → 정확히 60배 (이론값과 프레임 합을 섞어 비교한 실수)

## 결정한 것

- **"들어온 순간 한 발"은 `DetectedActors`에서 빼는 방식** — 구에서 나갔다 다시 들어오면 또 쏨. 쏜 타겟을 따로 기억하는 방식과는 기획이 다름 (훑을 때마다 쏘기 vs 들어올 때 한 번) (취향 · 바꿔도 됨). 도는 중인 목록에서 빼면 안 되므로 루프가 끝난 뒤에 뺀다
- **미사일은 타겟 액터를 지켜보는 포인터로** 들고, 매 프레임 지금 위치를 읽는다 (Transform 사진을 넘기지 않음)
- **만드는 순서는 돌아가는 순서와 반대로** — 미사일 혼자 직진 → (터렛 발사는 나중에) → 유도. 혼자 확인할 수 있는 가장 작은 조각부터
- **다단 추진** — `FMissileStage` 배열. 단계 수가 정해져 있어서 최고 속력이 저절로 생김 (각 단의 가속도 × 시간의 합)
- **마지막 단계 뒤부터 유도** (의도한 구조)
- **유도는 Tick에서 직접** — 외적(축) + 내적(각도) + `Min`(상한) + `FQuat` (취향 · 바꿔도 됨)
- **유도 테스트는 터렛 없이** — 미사일 Details에서 레벨의 타겟을 직접 고름

## 막힌 것 / 미해결

- **값으로 확인은 아직** — 눈으로는 잘 꺾여 날아감. 화면 로그로 남은 각도가 초당 약 180씩 줄어 0 근처에 머무는지는 안 봄
- **외적 순서 바꾸기 실험 안 함** — `CrossProduct(ToTarget, ForwardVector)`로 바꾸면 미사일이 고개를 돌려 도망가야 함
- **이름 정리 남음** — `Rotate`(축) → `TurnAxis`, `RotateSpeed`(이번 프레임 각도) → `StepAngleDeg`, `TargetFollowSpeed`(실제로는 추적 중 가속도) → `ChaseAcceleration`, `TargetChaseRotateSpeedDeg` → `MaxTurnSpeedDeg` 후보
- **헤더 정리 남음** — `TestTarget`은 `EditInstanceOnly, Category = "Missile"`가 맞음. `CurrentSpeed` 등 미사일이 혼자 세는 값은 `private`으로
- **타겟이 없으면 `return`이라 공중 정지** — 의도인지 정하기 (보통은 직진 유지)
- **`Config/DefaultEngine.ini`에 `[CoreRedirects]` 한 줄이 생김** — `TargetChaseRotateSpeed` → `TargetChaseRotateSpeedDeg` 이름 바꾸기 때 추가된 것으로 보임 (IDE 리팩터링이 넣은 것 같지만 확실치 않음). 이미 저장된 BP 값을 새 이름으로 이어 주는 설정
- 어제에서 넘어온 것: 빨강 경계선 방향 확인, `DetectCos`가 Play 중 안 바뀜, `OnConstruction` 정리, 맵 위치 `Content/TurretLevel/` vs 규약 `Content/Maps/`
- 오늘 변경분 미커밋 (`Missile.h/.cpp`, `BP_Missile`, `DefaultEngine.ini`, 레벨에 놓은 테스트 미사일)

## 다음에 할 것

- 남은 각도 화면 로그로 값 확인 + 외적 순서 바꾸기 실험
- 이름·헤더 정리 후 커밋
- **② 터렛이 쏘기**: 원뿔에 막 들어온 타겟에게 미사일 스폰 + 타겟 넘기기 + `DetectedActors`에서 빼기 — 설계 몇 줄부터

## 성장 점검

- **배웠다의 기준**
  - dt와 단위: ③ 설명하기 ✅ — "초당 값을 프레임별로 쪼개야 하고, 안 하면 60배로 움직인다"를 직접 문장으로 정리
  - 외적·내적으로 돌기: ③ 설명하기 ✅ (쓰임새 수준) — 축은 외적, 양은 내적을 직접 문장으로. ① 다시 만들기는 아직
  - `Min`으로 지나치지 않기: ③ 설명하기 반쯤 — "더 도는 걸 방지"까지 스스로 연결
  - 클래스 vs 인스턴스: ④ 알아보기 ❌ — 그저께 `MissileClass`로 배운 `TSubclassOf`를 이번엔 반대 상황(이미 있는 걸 가리키기)에 씀. 판단 질문 "새로 만들 건가, 가리킬 건가"로 기억
- **질문 수준**
  - 3단계(가설 확인): "dt를 곱했으니 프레임당 값 아냐?", "Angle에도 dt를 곱해야 하는 거 아냐?", "외적하면 회전량을 알아내는 건가?", "Min은 더 도는 걸 막으려고?" — 오늘 질문 대부분이 내 생각을 먼저 말하는 모양. 가설이 틀린 것도 있었지만 틀린 지점이 정확히 드러남
  - 판단(기획): "일정한 속력 아냐? 점점 빨라졌으면", 1·2·3단 추진 — 코드보다 기획을 먼저 말함
  - 1단계(어떻게?): "어떤 함수를 써야 할지 모르겠다", "TArray 범위 방어는?" — 새 API라 자연스러움. 첫 번째는 실마리를 합치는 단계에서 멈춘 것
  - 유니티 방식으로 먼저 설계하고(struct + 배열) 언리얼 문법만 물음 → 설계는 내가 함
- **끌려다님**: "통" 비유가 헷갈린다고 바로 말해서 설명 방식을 바꿈. 끌려다니지 않음
- **아쉬운 것**: "잘 된다"를 눈으로 확인하고 끝냄. 값(남은 각도)과 실험(외적 순서)까지 해야 손에 남음

## 습관 체크

- [ ] 새로 만든 것이 연습 폴더에 있다 — `BP_Missile`은 `Content/TurretLevel/` (맵 위치 결정 전)
- [x] 네이밍 규약을 지켰다 — `FMissileStage`, `FlyStages`, `CurrentSpeed`, `int32` 로 고침 / 남은 이름 정리 있음
- [ ] 눈 말고 값으로 확인했다 — 직진·가속·유도 모두 눈으로 확인. 화면 값(속력, 남은 각도)으로 본 기록은 없음
- [ ] Output Log에 새로 생긴 경고가 없다 — 확인 안 함
- [ ] 저장 후 커밋했다 — 오늘분 아직
