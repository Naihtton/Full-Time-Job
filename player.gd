extends CharacterBody2D

signal hp_changed(current_hp, max_hp)

@export var speed := 250.0
@export var max_hp := 10

var hp := 0
var can_attack := true

var current_weapon = {
	"name": "Baseball Bat",
	"damage": 1,
	"cooldown": 0.4
}

@onready var attack_area: Area2D = $AttackArea
@onready var attack_effect: Sprite2D = $AttackEffect
@onready var animated_sprite: AnimatedSprite2D = $AnimatedSprite2D
var last_direction := "down"

func _ready():
	hp = max_hp
	add_to_group("player")
	hp_changed.emit(hp, max_hp)
	attack_effect.visible = false

func _physics_process(_delta):
	var direction = Vector2(
		Input.get_action_strength("ui_right") - Input.get_action_strength("ui_left"),
		Input.get_action_strength("ui_down") - Input.get_action_strength("ui_up")
	).normalized()

	velocity = direction * speed
	move_and_slide()
	update_animation(direction)

	if Input.is_action_just_pressed("ui_accept"):
		attack()

func _input(event):
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_1:
			equip_weapon({
				"name": "Knife",
				"damage": 1,
				"cooldown": 0.15
			})

		if event.keycode == KEY_2:
			equip_weapon({
				"name": "Sledgehammer",
				"damage": 5,
				"cooldown": 1.0
			})

		if event.keycode == KEY_3:
			equip_weapon({
				"name": "Frying Pan",
				"damage": 2,
				"cooldown": 0.35
			})
			
func update_animation(direction: Vector2):
	if direction != Vector2.ZERO:
		if abs(direction.x) > abs(direction.y):
			last_direction = "right" if direction.x > 0 else "left"
		else:
			last_direction = "down" if direction.y > 0 else "up"

		animated_sprite.play("walk_" + last_direction)
	else:
		animated_sprite.play("idle_" + last_direction)
			
func play_attack_effect():
	attack_effect.visible = true
	attack_effect.modulate.a = 1.0
	attack_effect.scale = Vector2(0.3, 0.8)
	attack_effect.position = Vector2(45, 0)

	var tween = create_tween()
	tween.tween_property(attack_effect, "scale", Vector2(0.8, 1.2), 0.08)
	tween.tween_property(attack_effect, "modulate:a", 0.0, 0.08)

	await tween.finished
	attack_effect.visible = false

func attack():
	if not can_attack:
		return

	can_attack = false
	print("Attack with:", current_weapon["name"])
	play_attack_effect()
	for body in attack_area.get_overlapping_bodies():
		if body == self:
			continue

		if body.is_in_group("zombie") and body.has_method("take_damage"):
			body.take_damage(current_weapon["damage"])

			if body.has_method("apply_knockback"):
				body.apply_knockback(global_position)

	await get_tree().create_timer(current_weapon["cooldown"]).timeout
	can_attack = true

func equip_weapon(weapon_data):
	current_weapon = weapon_data
	print("Equipped:", current_weapon["name"])

func take_damage(amount):
	hp -= amount
	hp = max(hp, 0)

	hp_changed.emit(hp, max_hp)

	print("Player HP:", hp)

	if hp <= 0:
		die()

func die():
	print("YOU DIED")
	queue_free()
