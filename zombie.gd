extends CharacterBody2D

@export var speed := 100.0
@export var max_hp := 3
@export var damage := 1
@export var attack_range := 100.0
@export var attack_cooldown := 1.0
@export var knockback_force := 450.0
@export var knockback_time := 0.15

var knockback_velocity := Vector2.ZERO
var is_knocked_back := false

var hp := 0
var player: Node2D
var can_attack := true

@onready var sprite: Sprite2D = $Sprite2D

func _ready():
	hp = max_hp
	player = get_tree().get_first_node_in_group("player")

func _physics_process(delta):
	if is_knocked_back:
		velocity = knockback_velocity
		move_and_slide()
		return

	if player == null:
		return

	var distance = global_position.distance_to(player.global_position)

	if distance > attack_range:
		var direction = (player.global_position - global_position).normalized()
		velocity = direction * speed
	else:
		velocity = Vector2.ZERO

		if can_attack:
			attack()

	move_and_slide()

func attack():
	can_attack = false

	if player != null and player.has_method("take_damage"):
		player.take_damage(damage)
		print("Zombie Attack")

	await get_tree().create_timer(attack_cooldown).timeout
	can_attack = true

func take_damage(amount):
	hp -= amount
	print("Zombie HP:", hp)

	if sprite != null:
		sprite.modulate = Color.RED
		await get_tree().create_timer(0.1).timeout
		sprite.modulate = Color.WHITE

	if hp <= 0:
		queue_free()
