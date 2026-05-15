extends CharacterBody2D

@export var speed := 250.0
@export var max_hp := 10
@export var attack_damage := 1
@export var attack_cooldown := 0.4

var hp := 0
var can_attack := true
@onready var sprite: Sprite2D = $Sprite2D
@onready var attack_area: Area2D = $AttackArea

func _ready():
	hp = max_hp
	add_to_group("player")

func _physics_process(delta):
	var direction = Vector2(
		Input.get_action_strength("ui_right") - Input.get_action_strength("ui_left"),
		Input.get_action_strength("ui_down") - Input.get_action_strength("ui_up")
	).normalized()

	velocity = direction * speed
	move_and_slide()

	if Input.is_action_just_pressed("ui_accept"):
		attack()

func attack():
	if not can_attack:
		return

	can_attack = false
	print("Player Attack")

	for body in attack_area.get_overlapping_bodies():
		if body == self:
			continue

		if body.is_in_group("zombie") and body.has_method("take_damage"):
			body.take_damage(attack_damage)

			if body.has_method("apply_knockback"):
				body.apply_knockback(global_position)

	await get_tree().create_timer(attack_cooldown).timeout
	can_attack = true

func take_damage(amount):
	hp -= amount
	print("Player HP:", hp)
	if sprite != null:
		sprite.modulate = Color.RED
		await get_tree().create_timer(0.1).timeout
		sprite.modulate = Color.WHITE

	if hp <= 0:
		die()

func die():
	print("YOU DIED")
	queue_free()
