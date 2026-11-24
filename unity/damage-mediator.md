# 피해는 어디로 들어오나 — Hero.TakeDamage를 중재자와 HealthController로 나누기

> Unity · C# 설계 · 2026-11-24 — 직접 눌러 보는 그림은 [damage-mediator.html](damage-mediator.html)
>
> 앞 노트: [유니크가 늘 때마다 if가 쌓인다 — Observer 구독으로 옮기기](unique-mod-observer.md)
>
> 실습 원본: [unity-study / 08.SkillFeatureRefactor](https://github.com/DEV-JSB/unity-study/tree/main/Assets/Chapter/08.SkillFeatureRefactor)

## 발단

앞 노트에서 장비 특수 효과(유니크 모드)를 `if` 분기에서 Observer 구독으로 옮겼다. 그런데 `Hero.TakeDamage`가 아직 **피해를 계산하는 일까지** 하고 있었다. 이름은 "피해를 받는다"인데, 안에는 "피해를 어떻게 계산하나"라는 규칙이 섞여 있다. 다른 종류의 피해 보정이 생기면 이 함수가 또 늘어난다.

이 노트는 피해를 넣는 구조를 세 역할로 나눈 기록이다.

**한 줄 결론: 피해 계산 순서는 중재자(`DamageCalculator`)가, 체력 규칙은 `HealthController`가 맡고, 영웅은 알림을 받아 연출만 한다. 피해가 체력에 닿는 문은 하나만 둔다.**

## 1. 바꾸기 전 — 한 함수가 다섯 가지 일을 했다

```csharp
// Hero
public void TakeDamage(float incomingDamage)
{
    if (IsDead) return;

    DamageContext damageContext = new DamageContext(incomingDamage);   // 1. 피해 상자 만들기
    DamageModifying.Notify(damageContext);                              // 2. 피해 값 고치기 사건 (받는 피해 감소)
    damageContext.Damage *= (1f - damageContext.DamageDecreaseRatio);   // 3. 감소 비율 곱하기
    DamageApplying.Notify(damageContext);                               // 4. 판정 사건 (치명상 버티기)

    if (CurrentHp - damageContext.Damage > 0f)                          // 5. 체력 깎기, 0 하한
    {
        CurrentHp -= damageContext.Damage;
        return;
    }
    CurrentHp = 0f;
}

// Battle.BaseAttack
target.TakeDamage(attackResult.damage);
```

| 일 | 성격 |
|---|---|
| 1~4 | 피해를 **어떻게 계산하나** (규칙, 순서) |
| 5 | 체력을 **어떻게 바꾸나** (0 아래로 안 내려감, 쓰러짐) |
| (없음) | 맞았을 때 **무엇을 보여 주나** (피격 이펙트, UI) |

세 가지 성격이 한 함수에 섞여 있고, 연출이 들어갈 자리는 아예 없다.

## 2. 세 역할로 나눈다

| 누가 | 하는 일 |
|---|---|
| `DamageCalculator` (중재자, mediator) | 최종 피해를 계산한다. 대상의 사건을 순서대로 울리고, 감소 비율을 곱한다 |
| `HealthController` | 최종 피해를 체력에 반영한다. 0 하한, 쓰러짐 판정, 회복, 그리고 알림 |
| `Hero` | 장비, 공격력, 유니크 사건 같은 영웅 고유의 것. 체력은 `HealthController`에 맡기고, 알림을 받아 연출한다 |

바꾼 뒤 피해 한 번이 지나가는 길은 이렇다.

| 순서 | 누가 | 하는 일 |
|---|---|---|
| 1 | `Battle.BaseAttack` | 평타 결과 계산 (공격자의 `BaseAttacking` 알림 → 치명타 여부) |
| 2 | `DamageCalculator.ApplyAttackResult` | 피해 상자 만들기 → 대상의 `DamageModifying` → 감소 비율 곱하기 → 대상의 `DamageApplying` |
| 3 | `HealthController.ApplyDamage` | 체력 깎기, 0 하한 |
| 4 | `HealthController`의 알림 | `Damaged` → `HpChanged` → (0이면) `Died` |
| 5 | `Hero` (구독) | 피격 연출, 쓰러졌을 때 할 일 |

## 3. 중재자 — 계산 순서를 한곳에

```csharp
public static class DamageCalculator
{
    public static AttackResult CalculateBaseAttack(Hero attacker, bool isCritical) { ... }

    public static void ApplyAttackResult(Hero target, AttackResult damage)
    {
        if (target == null || damage == null)
        {
            return;
        }

        DamageContext damageContext = new DamageContext(damage.damage);
        target.DamageModifying.Notify(damageContext);
        damageContext.Damage *= (1f - damageContext.DamageDecreaseRatio);
        target.DamageApplying.Notify(damageContext);

        target.Health.ApplyDamage(damageContext);
    }
}
```

- 회사 코드도 피해 처리 쪽에서 **공격자와 대상을 둘 다** 받아 처리했다. 공격자 쪽 유니크(치명타)와 대상 쪽 유니크(감소, 버티기)가 피해 한 번에 같이 돌아야 하기 때문이다.
- 사건(`DamageModifying`, `DamageApplying`)은 그대로 영웅마다 있다. 중재자는 **대상 영웅의 사건을 어떤 순서로 울릴지**만 맡는다. 유니크 모드는 앞 노트처럼 자기 주인의 사건만 구독하면 된다.
- 평타는 `Battle.BaseAttack`이 결과를 계산한 뒤 이 중재자에 넘긴다.

```csharp
// Battle.BaseAttack
AttackResult attackResult = DamageCalculator.CalculateBaseAttack(attacker, baseAttackContext.IsCritical);
DamageCalculator.ApplyAttackResult(target, attackResult);
```

## 4. HealthController — 체력 규칙을 한곳에

회사 코드에는 영웅에 붙는 `HealthController`가 따로 있었다. 최대 체력, 현재 체력, UI에 알리는 사건, 그리고 영웅의 쓰러짐 처리를 부르는 부분이 있었다. 같은 모양으로 만들었다.

```csharp
public class HealthController
{
    public float MaxHp { get; private set; }
    public float CurrentHp { get; private set; }
    public bool IsDead => CurrentHp <= 0f;

    public readonly Observer<DamageContext> Damaged = new();       // 피격 연출이 구독
    public readonly Observer<float> HpChanged = new();             // UI 가 구독
    public readonly Observer<HealthController> Died = new();       // 주인이 구독

    public void ApplyDamage(DamageContext damageContext)
    {
        if (IsDead || damageContext.Damage <= 0f)
        {
            return;
        }

        CurrentHp = Mathf.Max(0f, CurrentHp - damageContext.Damage);
        Damaged.Notify(damageContext);
        HpChanged.Notify(CurrentHp);

        if (IsDead)
        {
            Died.Notify(this);
        }
    }

    public void Heal(float healAmount) { ... }   // 최대 체력을 넘지 않는다. 쓰러진 뒤에는 회복하지 않는다
}
```

`Hero`는 체력을 직접 들지 않고, 알림을 구독한다.

```csharp
// Hero
public HealthController Health { get; }
public float CurrentHp => Health.CurrentHp;
public bool IsDead => Health.IsDead;

public Hero(string heroName, float startHp, float attackPower)
{
    ...
    Health = new HealthController(startHp);
    Health.Damaged.Subscribe(OnDamaged);   // 피격 연출 자리
    Health.Died.Subscribe(OnDied);         // 쓰러졌을 때 할 일
}
```

| 정한 것 | 이유 |
|---|---|
| `SetHp` 같은 public 체력 설정을 두지 않음 | 체력을 아무 데서나 바꾸면 0 하한, 쓰러짐 확인을 부르는 쪽마다 지켜야 한다. 규칙은 `HealthController` 안에서만 지킨다 |
| `Died`로 **알림**, 영웅의 쓰러짐 함수를 직접 부르지 않음 | 회사 코드는 직접 불렀다. 그러면 `HealthController`가 `Hero`를 알아야 해서 몬스터에 붙일 때 또 고쳐야 한다. 알림이면 주인이 누군지 몰라도 된다 |
| `ApplyDamage`가 `DamageContext`를 통째로 받음 | 나중에 상자에 피격 이펙트 정보 같은 게 들어온다고 보고, 그걸 `Damaged` 알림으로 영웅 쪽에 넘긴다. 상자는 특정 대상이 아니라 피해 정보라서, 몬스터에 붙여도 문제없다 |
| `HpChanged`는 현재 체력(`float`)만 | UI는 체력 값만 있으면 된다. 최대 체력은 `Health.MaxHp`를 읽는다 |

체력 처리를 위해 영웅과 몬스터를 묶는 부모 class를 꼭 만들 필요도 줄어든다. 같은 `HealthController`를 붙이면 된다. 상속 대신 조립(composition)이다.

## 5. 피해가 체력에 닿는 문은 하나

`HealthController.ApplyDamage`를 부르는 곳은 **중재자 한 곳뿐**이어야 한다.

- `Battle`이 `Health.ApplyDamage`를 직접 부르면, 대상의 `DamageModifying` / `DamageApplying`이 안 울린다. 평타로 맞을 때만 받는 피해 감소와 치명상 버티기가 빠진다.
- `Hero`에 public `TakeDamage`를 남겨 두고 중재자가 그걸 거쳐 가게 하는 모양도 생각했다. 하지만 그 함수를 바로 부르면 똑같이 유니크를 건너뛴다. 그래서 `Hero`에서는 피해 입구를 아예 없앴다. 피격, 체력 변경, 쓰러짐은 모두 `HealthController`의 알림으로 받는다.

| 피해 종류 | 들어가는 길 |
|---|---|
| 평타 | `Battle.BaseAttack` → `DamageCalculator.ApplyAttackResult` → 대상의 사건 → `HealthController.ApplyDamage` → 알림 |
| 공격자 없는 피해 (함정, 독) | `DamageCalculator.ApplyAttackResult` → 대상의 사건 → `HealthController.ApplyDamage` → 알림 |

## 6. 검사기는 부르는 모양만 바꾼다

리팩토링 전 동작을 고정해 둔 검사기는 `hero.TakeDamage(150f)`로 피해를 줬다. `Hero.TakeDamage`가 없어졌으니, 검사기 안에 도우미 하나를 두고 중재자를 거치게 했다.

```csharp
// 공격자 없이 피해만 준다. 중재자의 피해 입구가 바뀌면 이 한 곳만 고친다
private static void DealDamage(Hero target, float damage)
{
    DamageCalculator.ApplyAttackResult(target, new AttackResult(damage, false));
}
```

`hero.TakeDamage(150f)` → `DealDamage(hero, 150f)`로 부르는 모양만 바꾸고, **정답 값은 한 줄도 안 바꿨다.** 그대로 모두 성공해서 동작이 같다는 걸 값으로 확인했다.

시나리오도 하나 늘렸다. 그 전까지는 시나리오가 전부 영웅 하나짜리였다. 감소 장비를 낀 영웅, 치명상 버티기 장비를 낀 영웅, 아무것도 안 낀 영웅을 같이 두고, 각자 맞았을 때 **자기 장비만** 동작하는지 보는 시나리오를 넣었다.

## 같이 고친 것 — 치명상 버티기 기록의 주인

이 작업 전에, 치명상 버티기의 "이번 스테이지에 썼나" 기록이 **장비를 다 뺀 사이에 스테이지가 바뀌면 안 지워지는** 경우를 찾았다. 기록은 class의 static인데, 지우는 구독은 장비를 낄 때 걸고 뺄 때 풀어서 수명이 달랐기 때문이다.

기록을 장착 · 해제를 맡는 static `UniqueModHandler`로 옮기고, 게임 시작 때 한 번 부르는 `Initialize()`에서 스테이지 시작을 구독하게 했다. 관리자는 장비가 하나도 없어도 늘 듣고 있으니 놓치지 않는다. 치명상 버티기 class는 관리자에게 "이 영웅이 이번 스테이지에 몇 번 썼나"를 묻고 적기만 한다.

## 정리

1. "피해를 받는다"에 계산 규칙과 체력 규칙이 섞이면, 보정이 늘 때마다 그 함수가 커진다
2. 피해 계산 순서는 중재자가 맡는다. 공격자와 대상을 둘 다 받고, 대상 영웅의 사건을 순서대로 울린다
3. 체력 규칙(0 하한, 쓰러짐, 회복)은 `HealthController` 한곳에서 지킨다. 체력을 바꾸는 public 문을 따로 열지 않는다
4. 주인에게는 직접 부르지 않고 알린다(`Damaged`, `HpChanged`, `Died`). 그래서 영웅에도 몬스터에도 붙일 수 있다
5. 피해가 체력에 닿는 문은 하나. 옆문이 있으면 유니크를 건너뛴다
6. 검사기는 부르는 모양만 바꾸고 정답 값은 그대로 둔다

## 더 보기

- [유니크가 늘 때마다 if가 쌓인다 — Observer 구독으로 옮기기](unique-mod-observer.md) — 이 노트의 앞 단계. 사건을 두 단계로 나눈 이유, 사건에 넘기는 상자
